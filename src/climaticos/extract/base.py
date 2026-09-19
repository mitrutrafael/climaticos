"""Cliente HTTP resiliente com retry, backoff exponencial e timeout."""

from __future__ import annotations

import random
import time
from typing import Any, Self

import requests

from ..logging_setup import get_logger

logger = get_logger("extract.base")

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}


class ApiError(RuntimeError):
    """Erro irreversível após esgotar as tentativas de uma requisição."""


class ResilientClient:
    """Wrapper de ``requests.Session`` com retry automático.

    Replace as chamadas diretas a ``requests.get`` por ``self.get_json``,
    que aplica timeout, verificação de status e backoff exponencial com jitter.

    Args:
        timeout: Timeout em segundos por requisição.
        max_retries: Número máximo de tentativas.
        backoff: Backoff base em segundos (o atraso é ``backoff * 2**attempt``).
    """

    def __init__(self, timeout: float = 30.0, max_retries: int = 3, backoff: float = 1.0) -> None:
        self.timeout = timeout
        self.max_retries = max_retries
        self.backoff = backoff
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "climaticos-etl/1.0"})

    def get_json(self, url: str, **kwargs: Any) -> Any:
        """Executa ``GET`` e retorna o JSON decodificado.

        Tentativas são repetidas para erros transitórios (429/5xx, timeout de
        rede e conexão). Erros 4xx comuns (401/403/404) falham imediatamente.

        Args:
            url: URL completa.
            **kwargs: Argumentos extras para ``requests.get`` (headers, params...).

        Returns:
            Objeto decodificado do JSON (dict ou list).

        Raises:
            ApiError: Se todas as tentativas falharem ou o status não for 2xx.
        """
        last_error: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                response = self.session.get(url, timeout=self.timeout, **kwargs)
                if response.status_code in _RETRYABLE_STATUS and attempt < self.max_retries:
                    self._sleep(attempt)
                    continue
                if not 200 <= response.status_code < 300:
                    raise ApiError(
                        f"HTTP {response.status_code} em {url}: {response.text[:200]}"
                    )
                return response.json()
            except (requests.Timeout, requests.ConnectionError) as exc:
                last_error = exc
                logger.warning(
                    "Falha de rede em %s (tentativa %d/%d): %s",
                    url, attempt, self.max_retries, exc,
                )
                if attempt < self.max_retries:
                    self._sleep(attempt)
        raise ApiError(f"Falha ao acessar {url} após {self.max_retries} tentativas") from last_error

    def _sleep(self, attempt: int) -> None:
        """Atraso com backoff exponencial e jitter aleatório."""
        delay = self.backoff * (2 ** (attempt - 1)) + random.uniform(0, 0.5)
        logger.debug("Aguardando %.2fs antes de retentar...", delay)
        time.sleep(delay)

    def close(self) -> None:
        """Fecha a sessão HTTP subjacente."""
        self.session.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()