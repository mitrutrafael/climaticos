"""Extrator da WeatherLink v2 API (dados históricos das estações Davis)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any

from ..config import Station
from ..logging_setup import get_logger
from .base import ResilientClient

logger = get_logger("extract.davis")

_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


def _to_epoch(dt: datetime) -> int:
    """Converte um datetime UTC para timestamp em segundos."""
    return int(dt.replace(tzinfo=UTC).timestamp())


class DavisExtractor:
    """Coleta dados brutos (por sensor) da WeatherLink v2.

    A API histórica limita a janela por chamada, então o período é dividido em
    fatias diárias (atributo ``chunk_days``).

    Args:
        api_key: Chave de API da WeatherLink.
        api_secret: Segredo de assinatura (cabeçalho ``X-Api-Secret``).
        stations: Estações Davis a consultar.
        base_url: URL base da API v2.
        chunk_days: Tamanho da janela por chamada (máx. 1 dia).
        client: Cliente HTTP resiliente (criado internamente se omitido).
    """

    def __init__(
        self,
        api_key: str,
        api_secret: str,
        stations: tuple[Station, ...],
        base_url: str,
        chunk_days: int = 1,
        client: ResilientClient | None = None,
    ) -> None:
        if not api_key or not api_secret:
            raise ValueError("api_key e api_secret da WeatherLink são obrigatórios")
        self.api_key = api_key
        self.api_secret = api_secret
        self.stations = stations
        self.base_url = base_url.rstrip("/")
        self.chunk_days = max(1, int(chunk_days))
        self.client = client or ResilientClient()

    def _headers(self) -> dict[str, str]:
        """Cabeçalhos de autenticação da WeatherLink."""
        return {"X-Api-Secret": self.api_secret}

    def _fetch_chunk(self, station: Station, since: int, until: int) -> list[dict[str, Any]]:
        """Chama o endpoint ``/historic`` para uma janela e retorna os registros brutos."""
        url = (
            f"{self.base_url}/historic/{station.id}"
            f"?api-key={self.api_key}"
            f"&start-timestamp={since}"
            f"&end-timestamp={until}"
        )
        payload = self.client.get_json(url, headers=self._headers())
        records: list[dict[str, Any]] = []
        for sensor in payload.get("sensors", []) or []:
            for rec in sensor.get("data", []) or []:
                if not isinstance(rec, dict):
                    continue
                records.append(
                    {
                        "ts": rec.get("ts"),
                        "tz_offset": rec.get("tz_offset"),
                        "temp_out": rec.get("temp_out"),
                        "temp_out_hi": rec.get("temp_out_hi"),
                        "temp_out_lo": rec.get("temp_out_lo"),
                        "hum_out": rec.get("hum_out"),
                        "rainfall_mm": rec.get("rainfall_mm"),
                        "et": rec.get("et"),
                        "wind_speed_avg": rec.get("wind_speed_avg"),
                        "wind_dir_of_prevail": rec.get("wind_dir_of_prevail"),
                        "solar_rad_avg": rec.get("solar_rad_avg"),
                    }
                )
        return records

    def fetch_station(self, station: Station, start: date, end: date) -> list[dict[str, Any]]:
        """Baixa os registros brutos de uma estação, anexando os metadados.

        Args:
            station: Estação Davis.
            start: Data inicial (inclusive).
            end: Data final (exclusiva, como no script original).

        Returns:
            Lista de registros brutos com os metadados da estação.
        """
        records: list[dict[str, Any]] = []
        day = start
        step = timedelta(days=self.chunk_days)
        while day < end:
            chunk_end = min(day + step, end)
            since = _to_epoch(datetime.combine(day, datetime.min.time()))
            until = _to_epoch(datetime.combine(chunk_end, datetime.min.time()))
            try:
                chunk = self._fetch_chunk(station, since, until)
                records.extend(chunk)
            except Exception:
                logger.exception("Falha na janela %s..%s da estação %s", day, chunk_end, station.device)
            day = chunk_end
        return records

    def fetch_all(self, start: date, end: date) -> list[dict[str, Any]]:
        """Coleta registros brutos de todas as estações no período.

        Args:
            start: Data inicial (inclusive).
            end: Data final (exclusiva).

        Returns:
            Registros brutos com metadados de estação.
        """
        all_records: list[dict[str, Any]] = []
        for station in self.stations:
            raw = self.fetch_station(station, start, end)
            logger.info("Davis %s: %d registros brutos", station.device, len(raw))
            for rec in raw:
                rec.update(
                    {
                        "device": station.device,
                        "site": station.site,
                        "city": station.city,
                        "state": station.state,
                        "lat": station.lat,
                        "lon": station.lon,
                    }
                )
            all_records.extend(raw)
        return all_records