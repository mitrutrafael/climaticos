"""Extrator da NASA POWER API (dados diários de satélite/modelo por coordenada).

Usado como série de comparação nas coordenadas das estações Arable e Davis.
A API é pública (sem chave), tem resolução de ~0,5° (≈ 50 km) e publica os
dados com alguns dias de atraso (precipitação ~3 dias, radiação ~7 dias).
"""

from __future__ import annotations

import math
from datetime import date
from typing import Any

import pandas as pd

from ..config import OUTPUT_COLUMNS, Station
from ..logging_setup import get_logger
from ..transform.units import calc_vpd, deg_to_compass, round1, to_float
from .base import ResilientClient

logger = get_logger("extract.nasa_power")

# Parâmetros da comunidade AG (radiação em MJ/m²·dia).
# Vento: usa 10 m convertido para 2 m. O WS2M do POWER sai quase zero em células
# de rugosidade alta (ex.: −25,59 / −51,49 → 0,01–0,17 m/s com WS10M ≈ 1 m/s).
PARAMETERS = (
    "T2M", "T2M_MAX", "T2M_MIN", "RH2M", "PRECTOTCORR",
    "WS10M", "WS10M_MAX", "WS10M_MIN", "WD10M",
    "ALLSKY_SFC_SW_DWN", "TOA_SW_DWN",
)
# FAO-56, eq. 47: u2 = uz · 4,87 / ln(67,8·z − 5,42), com z = 10 m
WIND_10M_TO_2M = 4.87 / math.log(67.8 * 10 - 5.42)


def wind_10m_to_2m(speed: float | None) -> float | None:
    """Converte velocidade do vento de 10 m para 2 m (perfil logarítmico FAO-56)."""
    return round1(speed * WIND_10M_TO_2M) if speed is not None else None
SOURCE_SITE_PREFIX = "NASA POWER · "


def hargreaves_eto(t_mean: Any, t_max: Any, t_min: Any, ra_mj: Any) -> float | None:
    """ETo de Hargreaves-Samani (FAO-56, eq. 52), em mm/dia.

    ``ETo = 0,0023 · (Tmédia + 17,8) · √(Tmáx − Tmín) · Ra``, com ``Ra``
    (radiação no topo da atmosfera) convertida de MJ/m² para mm (× 0,408).
    """
    tm, tx, tn, ra = (to_float(v) for v in (t_mean, t_max, t_min, ra_mj))
    if None in (tm, tx, tn, ra):
        return None
    return round(max(0.0, 0.0023 * (tm + 17.8) * math.sqrt(max(tx - tn, 0.0)) * ra * 0.408), 1)


class NasaPowerExtractor:
    """Coleta séries diárias da NASA POWER para as coordenadas das estações.

    Args:
        stations: Estações (precisam de ``lat``/``lon``; as sem coordenada são ignoradas).
        base_url: URL do endpoint ``/temporal/daily/point``.
        client: Cliente HTTP resiliente (criado internamente se omitido).
    """

    def __init__(self, stations: tuple[Station, ...], base_url: str,
                 client: ResilientClient | None = None) -> None:
        self.stations = stations
        self.base_url = base_url
        self.client = client or ResilientClient(timeout=120.0)

    def fetch_station(self, station: Station, start: date, end: date) -> list[dict[str, Any]]:
        """Busca e mapeia a série diária de uma estação (período inclusivo).

        Dias ainda não publicados pela NASA (todos os valores = ``fill_value``)
        são omitidos, para não gravar linhas vazias.
        """
        params = {
            "parameters": ",".join(PARAMETERS),
            "community": "AG",
            "latitude": station.lat,
            "longitude": station.lon,
            "start": start.strftime("%Y%m%d"),
            "end": end.strftime("%Y%m%d"),
            "format": "JSON",
            "time-standard": "LST",
        }
        payload = self.client.get_json(self.base_url, params=params)
        fill = (payload.get("header") or {}).get("fill_value", -999.0)
        series: dict[str, dict[str, float]] = (
            (payload.get("properties") or {}).get("parameter") or {}
        )

        def value(name: str, day: str) -> float | None:
            v = to_float((series.get(name) or {}).get(day))
            return None if v is None or v == fill else v

        rows: list[dict[str, Any]] = []
        for day in sorted(series.get("T2M") or {}):
            values = {name: value(name, day) for name in PARAMETERS}
            if all(v is None for v in values.values()):
                continue
            t_mean, t_max, t_min = values["T2M"], values["T2M_MAX"], values["T2M_MIN"]
            rh = values["RH2M"]
            rows.append({
                "device": station.device,
                "site": SOURCE_SITE_PREFIX + station.site,
                "city": station.city,
                "state": station.state,
                "date": f"{day[:4]}-{day[4:6]}-{day[6:]}",
                "tair_mean": round1(t_mean),
                "tair_max": round1(t_max),
                "tair_min": round1(t_min),
                "rh_mean": round1(rh),
                "precip": round1(values["PRECTOTCORR"]),
                "et": hargreaves_eto(t_mean, t_max, t_min, values["TOA_SW_DWN"]),
                "wind_speed": wind_10m_to_2m(values["WS10M"]),
                "wind_speed_max": wind_10m_to_2m(values["WS10M_MAX"]),
                "wind_speed_min": wind_10m_to_2m(values["WS10M_MIN"]),
                "wind_dir": deg_to_compass(values["WD10M"]),
                "vpd": calc_vpd(t_mean, rh),
                "swdw": round1(values["ALLSKY_SFC_SW_DWN"]),
                "ndvi": None,
                "lat": station.lat,
                "lon": station.lon,
            })
        return rows

    def fetch_all(self, start: date, end: date) -> pd.DataFrame:
        """Coleta a série de todas as estações com coordenadas.

        Returns:
            ``DataFrame`` no schema ``OUTPUT_COLUMNS``.
        """
        rows: list[dict[str, Any]] = []
        for station in self.stations:
            if station.lat is None or station.lon is None:
                logger.warning("NASA POWER: %s sem coordenadas — ignorada", station.device)
                continue
            try:
                station_rows = self.fetch_station(station, start, end)
                logger.info("NASA POWER %s: %d dias", station.device, len(station_rows))
                rows.extend(station_rows)
            except Exception:
                logger.exception("Falha ao extrair NASA POWER %s", station.device)
        return pd.DataFrame(rows, columns=OUTPUT_COLUMNS)
