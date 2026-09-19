"""Extrator da Arable Cloud API v2 (dados diários por estação)."""

from __future__ import annotations

from datetime import date
from typing import Any

import pandas as pd

from ..config import OUTPUT_COLUMNS, Station
from ..logging_setup import get_logger
from .base import ResilientClient

logger = get_logger("extract.arable")

_LIMIT = 2000


class ArableExtractor:
    """Coleta dados diários da Arable Cloud API.

    Args:
        api_key: Chave de API Arable (formato ``Apikey <chave>``).
        stations: Estações Arable a consultar.
        base_url: URL base da API v2.
        client: Cliente HTTP resiliente (criado internamente se omitido).
    """

    def __init__(
        self,
        api_key: str,
        stations: tuple[Station, ...],
        base_url: str,
        client: ResilientClient | None = None,
    ) -> None:
        if not api_key:
            raise ValueError("api_key da Arable é obrigatória")
        self.api_key = api_key
        self.stations = stations
        self.base_url = base_url.rstrip("/")
        self.client = client or ResilientClient()

    def _headers(self) -> dict[str, str]:
        """Cabeçalho de autenticação da Arable."""
        return {"Authorization": f"Apikey {self.api_key}"}

    def fetch_station(self, station: Station, start: date, end: date) -> list[dict[str, Any]]:
        """Busca e mapeia os registros diários de uma única estação.

        Args:
            station: Estação Arable.
            start: Data inicial (inclusive).
            end: Data final (inclusive).

        Returns:
            Lista de dicionários no schema ``OUTPUT_COLUMNS``. Vazia se a API
            não retornar dados.
        """
        url = f"{self.base_url}/data/daily"
        params = {
            "device": station.device,
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "limit": _LIMIT,
        }
        items = self.client.get_json(url, headers=self._headers(), params=params)
        if not isinstance(items, list):
            logger.warning("Resposta inesperada da Arable para %s (%s)", station.device, type(items).__name__)
            return []

        rows: list[dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            mean_rh = item.get("mean_rh")
            rh = round(float(mean_rh) * 100, 1) if mean_rh is not None else None
            rows.append(
                {
                    "device": station.device,
                    "site": station.site,
                    "city": station.city,
                    "state": station.state,
                    "date": (item.get("time") or "").split("T")[0],
                    "tair_mean": item.get("meant"),
                    "tair_max": item.get("maxt"),
                    "tair_min": item.get("mint"),
                    "rh_mean": rh,
                    "precip": item.get("precip"),
                    "et": item.get("et"),
                    "wind_speed": item.get("wind_speed"),
                    "wind_dir": item.get("wind_direction"),
                    "vpd": item.get("vpd"),
                    "swdw": item.get("swdw"),
                    "ndvi": item.get("ndvi"),
                    "lat": item.get("lat"),
                    "lon": item.get("long"),
                }
            )

        return rows

    def fetch_all(self, start: date, end: date) -> pd.DataFrame:
        """Coleta os dados de todas as estações no período informado.

        Args:
            start: Data inicial (inclusive).
            end: Data final (inclusive).

        Returns:
            ``DataFrame`` no schema ``OUTPUT_COLUMNS``.
        """
        rows: list[dict[str, Any]] = []
        for station in self.stations:
            try:
                station_rows = self.fetch_station(station, start, end)
                logger.info("Arable %s: %d registros", station.device, len(station_rows))
                rows.extend(station_rows)
            except Exception:
                logger.exception("Falha ao extrair Arable %s", station.device)
        return pd.DataFrame(rows, columns=OUTPUT_COLUMNS)