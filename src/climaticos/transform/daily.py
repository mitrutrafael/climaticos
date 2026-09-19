"""Transformação de dados brutos em registros diários consolidados."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from typing import Any

import pandas as pd

from ..config import OUTPUT_COLUMNS
from .units import (
    calc_vpd,
    deg_to_compass,
    fahrenheit_to_celsius,
    inches_to_mm,
    mph_to_ms,
    round1,
)


def _localtime(ts: int | None, tz_offset: int | None) -> str:
    """Retorna a data local ``YYYY-MM-DD`` a partir de epoch + offset."""
    if ts is None:
        return ""
    dt = datetime.fromtimestamp(int(ts), tz=UTC) + timedelta(seconds=int(tz_offset or 0))
    return dt.strftime("%Y-%m-%d")


def _mean(values: Iterable[Any]) -> float | None:
    """Média dos valores numéricos (ignora ``None``); ``None`` se vazio."""
    nums = [float(v) for v in values if v is not None]
    if not nums:
        return None
    return sum(nums) / len(nums)


def aggregate_davis_records(records: Iterable[dict[str, Any]]) -> pd.DataFrame:
    """Agrega registros brutos da Davis em uma linha diária por estação.

    Reproduz exatamente a agregação do script PowerShell original:

    * temperatura média/máx/mín a partir de ``temp_out``/``temp_out_hi``/``temp_out_lo``;
    * precipitação = soma de ``rainfall_mm``;
    * et = soma de ``et`` (polegadas → mm);
    * vento = média de ``wind_speed_avg`` (mph → m/s);
    * VPD calculado a partir da temperatura e umidade médias.

    Args:
        records: Registros brutos do ``DavisExtractor``.

    Returns:
        ``DataFrame`` no schema ``OUTPUT_COLUMNS``.
    """
    by_day: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for rec in records:
        key = (rec.get("device", ""), _localtime(rec.get("ts"), rec.get("tz_offset")))
        by_day.setdefault(key, []).append(rec)

    rows: list[dict[str, Any]] = []
    for (device, day), group in by_day.items():
        first = group[0]
        temps_c = [fahrenheit_to_celsius(r.get("temp_out")) for r in group]
        rh = [r.get("hum_out") for r in group]
        t_mean = round1(_mean(temps_c))
        t_max_values = [fahrenheit_to_celsius(r.get("temp_out_hi")) for r in group if r.get("temp_out_hi") is not None]
        t_min_values = [fahrenheit_to_celsius(r.get("temp_out_lo")) for r in group if r.get("temp_out_lo") is not None]
        t_max = round1(max(t_max_values)) if t_max_values else None
        t_min = round1(min(t_min_values)) if t_min_values else None
        rh_mean = round1(_mean(rh))
        precip = round1(sum(r.get("rainfall_mm") or 0 for r in group))
        et = round1(sum(inches_to_mm(r.get("et")) or 0 for r in group))
        wind = round1(_mean(mph_to_ms(r.get("wind_speed_avg")) for r in group))
        wd_value = next((r.get("wind_dir_of_prevail") for r in group if r.get("wind_dir_of_prevail") is not None), None)
        wind_dir = deg_to_compass(wd_value)
        swdw = round1(_mean(r.get("solar_rad_avg") for r in group))
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