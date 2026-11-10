"""Transformação de dados brutos em registros diários consolidados."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from typing import Any

import pandas as pd

from ..config import OUTPUT_COLUMNS
from ..logging_setup import get_logger
from .units import (
    calc_vpd,
    deg_to_compass,
    fahrenheit_to_celsius,
    inches_to_mm,
    mph_to_ms,
    round1,
    w_m2_to_mj_day,
)

logger = get_logger("transform.daily")


def _localtime(ts: int | None, tz_offset: int | None) -> str:
    """Retorna a data local ``YYYY-MM-DD`` a partir de epoch + offset."""
    if ts is None:
        return ""
    dt = datetime.fromtimestamp(int(ts), tz=UTC) + timedelta(seconds=int(tz_offset or 0))
    return dt.strftime("%Y-%m-%d")


# Faixa física aceita para temperatura do ar (°C). Fora dela é leitura inválida,
# ex.: −90 °F (−67,8 °C) que o console Davis envia com o sensor desconectado.
_TEMP_RANGE_C = (-40.0, 60.0)


def _temp_c(fahrenheit: Any) -> float | None:
    """Converte °F → °C descartando leituras fora da faixa física."""
    c = fahrenheit_to_celsius(fahrenheit)
    if c is None or not _TEMP_RANGE_C[0] <= c <= _TEMP_RANGE_C[1]:
        return None
    return c


def _mean(values: Iterable[Any]) -> float | None:
    """Média dos valores numéricos (ignora ``None``); ``None`` se vazio."""
    nums = [float(v) for v in values if v is not None]
    if not nums:
        return None
    return sum(nums) / len(nums)


# tamanho do basculante da Davis por código ``rain_size`` (em mm)
_RAIN_SIZE_MM = {1: 0.254, 2: 0.2, 3: 0.1, 4: 0.0254}


def _rain_mm(rec: dict[str, Any]) -> float:
    """Chuva do intervalo em mm: ``rainfall_mm`` ou, na falta, polegadas/cliques."""
    for key, factor in (("rainfall_mm", 1.0), ("rainfall_in", 25.4)):
        value = rec.get(key)
        if value is not None:
            return float(value) * factor
    clicks, size = rec.get("rainfall_clicks"), rec.get("rain_size")
    if clicks is not None and size in _RAIN_SIZE_MM:
        return float(clicks) * _RAIN_SIZE_MM[size]
    return 0.0


def _local_hour(ts: int | None, tz_offset: int | None) -> int | None:
    """Hora local (0–23) de um registro."""
    if ts is None:
        return None
    return (datetime.fromtimestamp(int(ts), tz=UTC) + timedelta(seconds=int(tz_offset or 0))).hour


def aggregate_davis_records(records: Iterable[dict[str, Any]], min_hours: int = 0) -> pd.DataFrame:
    """Agrega registros brutos da Davis em uma linha diária por estação.

    Reproduz exatamente a agregação do script PowerShell original:

    * temperatura média/máx/mín a partir de ``temp_out``/``temp_out_hi``/``temp_out_lo``;
    * precipitação = soma de ``rainfall_mm``;
    * et = soma de ``et`` (polegadas → mm);
    * vento = média de ``wind_speed_avg`` (mph → m/s);
    * vento máx. (rajada) = maior ``wind_speed_hi`` do dia (mph → m/s);
    * vento mín. = menor ``wind_speed_avg`` dos intervalos do dia (mph → m/s);
    * radiação = média de ``solar_rad_avg`` (W/m² → MJ/m²·dia);
    * VPD calculado a partir da temperatura e umidade médias.

    Args:
        records: Registros brutos do ``DavisExtractor``.
        min_hours: Descarta dias com registros em menos horas locais distintas
            que isso (dias incompletos subestimam chuva, ET e radiação e não
            devem sobrescrever o histórico). ``0`` mantém todos.

    Returns:
        ``DataFrame`` no schema ``OUTPUT_COLUMNS``.
    """
    by_day: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for rec in records:
        key = (rec.get("device", ""), _localtime(rec.get("ts"), rec.get("tz_offset")))
        by_day.setdefault(key, []).append(rec)

    rows: list[dict[str, Any]] = []
    for (device, day), group in by_day.items():
        if min_hours:
            hours = {_local_hour(r.get("ts"), r.get("tz_offset")) for r in group} - {None}
            if len(hours) < min_hours:
                logger.warning("Davis %s %s incompleto (%d h de dados) — ignorado", device, day, len(hours))
                continue
        first = group[0]
        temps_c = [_temp_c(r.get("temp_out")) for r in group]
        rh = [r.get("hum_out") for r in group]
        t_mean = round1(_mean(temps_c))
        t_max_values = [t for t in (_temp_c(r.get("temp_out_hi")) for r in group) if t is not None]
        t_min_values = [t for t in (_temp_c(r.get("temp_out_lo")) for r in group) if t is not None]
        t_max = round1(max(t_max_values)) if t_max_values else None
        t_min = round1(min(t_min_values)) if t_min_values else None
        rh_mean = round1(_mean(rh))
        precip = round1(sum(_rain_mm(r) for r in group))
        et = round1(sum(inches_to_mm(r.get("et")) or 0 for r in group))
        wind = round1(_mean(mph_to_ms(r.get("wind_speed_avg")) for r in group))
        wind_hi = [mph_to_ms(r.get("wind_speed_hi")) for r in group if r.get("wind_speed_hi") is not None]
        wind_lo = [mph_to_ms(r.get("wind_speed_avg")) for r in group if r.get("wind_speed_avg") is not None]
        wind_max = round1(max(wind_hi)) if wind_hi else None
        wind_min = round1(min(wind_lo)) if wind_lo else None
        wd_value = next((r.get("wind_dir_of_prevail") for r in group if r.get("wind_dir_of_prevail") is not None), None)
        wind_dir = deg_to_compass(wd_value)
        # solar_rad_avg vem em W/m²; o dashboard (e a Arable) usam MJ/m²·dia
        swdw = w_m2_to_mj_day(_mean(r.get("solar_rad_avg") for r in group))
        vpd = calc_vpd(t_mean, rh_mean)

        row = {
            "device": device,
            "site": first.get("site", ""),
            "city": first.get("city", ""),
            "state": first.get("state", ""),
            "date": day,
            "tair_mean": t_mean,
            "tair_max": t_max,
            "tair_min": t_min,
            "rh_mean": rh_mean,
            "precip": precip,
            "et": et,
            "wind_speed": wind,
            "wind_speed_max": wind_max,
            "wind_speed_min": wind_min,
            "wind_dir": wind_dir,
            "vpd": vpd,
            "swdw": swdw,
            "ndvi": None,
            "lat": first.get("lat"),
            "lon": first.get("lon"),
        }
        rows.append(row)

    rows.sort(key=lambda r: (r["device"].lower(), r["date"]))
    return pd.DataFrame(rows, columns=OUTPUT_COLUMNS)