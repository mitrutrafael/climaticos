"""Configuração central do pipeline, lida de variáveis de ambiente."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta


@dataclass(frozen=True)
class Station:
    """Estação meteorológica com identificador e metadados fixos.

    Attributes:
        id: Identificador numérico usado pela API WeatherLink (apenas Davis).
        device: Identificador público da estação (ex.: ``D009893`` ou ``DV13917``).
        site: Nome do local da estação.
        city: Cidade.
        state: UF (sigla).
        lat: Latitude em graus decimais.
        lon: Longitude em graus decimais.
    """

    id: int
    device: str
    site: str
    city: str
    state: str
    lat: float | None = None
    lon: float | None = None


ARABLE_STATIONS: tuple[Station, ...] = (
    Station(id=0, device="D009893", site="BO Fátima do Sul", city="Fátima do Sul", state="MS"),
    Station(id=0, device="D009889", site="BF Toledo Area 2", city="Toledo", state="PR"),
    Station(id=0, device="D009881", site="BH Indianopolis", city="Indianópolis", state="MG"),
    Station(id=0, device="D006582", site="BW Mogi Mirim", city="Mogi Mirim", state="SP"),
    Station(id=0, device="D006917", site="BC Planaltina", city="Planaltina", state="DF"),
    Station(id=0, device="D006926", site="PC Sao Luiz Gonzaga", city="São Luiz Gonzaga", state="RS"),
    Station(id=0, device="D006642", site="BL Ponta Grossa", city="Ponta Grossa", state="PR"),
    Station(id=0, device="D009895", site="PC Cruz Alta", city="Cruz Alta", state="RS"),
    Station(id=0, device="D009878", site="BM Sorriso", city="Sorriso", state="MT"),
    Station(id=0, device="D009876", site="Corteva GPB BL", city="Ponta Grossa", state="PR"),
)

DAVIS_STATIONS: tuple[Station, ...] = (
    Station(id=13917, device="DV13917", site="Corteva Passo Fundo", city="Passo Fundo", state="RS", lat=-28.12846, lon=-52.30285),
    Station(id=16450, device="DV16450", site="Corteva Guarapuava", city="Guarapuava", state="PR", lat=-25.58853, lon=-51.49284),
    Station(id=18648, device="DV18648", site="Corteva Ponta Grossa", city="Ponta Grossa", state="PR", lat=-25.26254, lon=-50.095493),
    Station(id=59252, device="DV59252", site="Corteva Toledo", city="Toledo", state="PR", lat=-24.67118, lon=-53.76017),
)

OUTPUT_COLUMNS: tuple[str, ...] = (
    "device",
    "site",
    "city",
    "state",
    "date",
    "tair_mean",
    "tair_max",
    "tair_min",
    "rh_mean",
    "precip",
    "et",
    "wind_speed",
    "wind_dir",
    "vpd",
    "swdw",
    "ndvi",
    "lat",
    "lon",
)


@dataclass(frozen=True)
class Config:
    """Configuração do pipeline, montada a partir do ambiente.

    Attributes:
        arable_api_key: Chave de API da Arable Cloud (``ARABLE_API_KEY``).
        davis_api_key: Chave de API da WeatherLink (``DAVIS_API_KEY``).
        davis_api_secret: Segredo de assinatura da WeatherLink (``DAVIS_API_SECRET``).
        arable_url: URL base da Arable Cloud API.
        davis_url: URL base da WeatherLink v2.
        davis_chunk_days: Janela em dias por chamada à API Davis (limitada a 24 h).
        request_timeout: Timeout em segundos por requisição HTTP.
        max_retries: Número máximo de tentativas por requisição.
        retry_backoff: Backoff base (s) entre tentativas.
        history_days: Período padrão (em dias) usado quando não há datas explícitas.
        arable_stations: Estações Arable monitoradas.
        davis_stations: Estações Davis monitoradas.
    """

    arable_api_key: str = field(default_factory=lambda: os.environ.get("ARABLE_API_KEY", ""))
    davis_api_key: str = field(default_factory=lambda: os.environ.get("DAVIS_API_KEY", ""))
    davis_api_secret: str = field(default_factory=lambda: os.environ.get("DAVIS_API_SECRET", ""))
    arable_url: str = "https://api.arable.cloud/api/v2"
    davis_url: str = "https://api.weatherlink.com/v2"
    davis_chunk_days: int = 1
    request_timeout: float = 30.0
    max_retries: int = 3
    retry_backoff: float = 1.0
    history_days: int = 30
    arable_stations: tuple[Station, ...] = ARABLE_STATIONS
    davis_stations: tuple[Station, ...] = DAVIS_STATIONS


def default_date_range(days: int | None = None) -> tuple[date, date]:
    """Calcula o intervalo padrão ``(início, fim)`` terminando hoje.

    Args:
        days: Quantos dias de histórico. Usa ``history_days`` da config se ``None``.

    Returns:
        Tupla ``(start_date, end_date)``; ``today`` é usado como fim.
    """
    days = days or Config().history_days
    end = datetime.now(UTC).date()
    start = end - timedelta(days=days)
    return start, end


def load_config() -> Config:
    """Constrói e valida a configuração a partir do ambiente.

    Raises:
        RuntimeError: Se alguma chave de API obrigatória estiver ausente.
    """
    cfg = Config()
    missing = []
    if not cfg.arable_api_key:
        missing.append("ARABLE_API_KEY")
    if not cfg.davis_api_key or not cfg.davis_api_secret:
        missing.extend(x for x in ("DAVIS_API_KEY", "DAVIS_API_SECRET") if not getattr(cfg, x.lower()))
    if missing:
        raise RuntimeError(
            "Variáveis de ambiente ausentes: " + ", ".join(missing)
        )
    return cfg