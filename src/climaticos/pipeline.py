"""Orquestração do ETL climático (extração → transformação → carga)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import pandas as pd

from .config import Config
from .extract.arable import ArableExtractor
from .extract.base import ResilientClient
from .extract.davis import DavisExtractor
from .load.csv_loader import upsert, write_csv_atomic
from .logging_setup import get_logger
from .transform.daily import aggregate_davis_records

logger = get_logger("pipeline")


@dataclass
class PipelineResult:
    """Resumo da execução do pipeline.

    Attributes:
        arable_rows: Linhas Arable atualizadas no período.
        davis_rows: Linhas Davis consolidadas no período.
        arable_total: Total de linhas no CSV Arable após merge.
        davis_total: Total de linhas no CSV Davis após merge.
    """

    arable_rows: int
    davis_rows: int
    arable_total: int
    davis_total: int


class Pipeline:
    """Executa o fluxo completo de atualização dos dois CSVs.

    Args:
        config: Configuração com chaves de API e parâmetros.
        arable_path: Caminho do CSV Arable.
        davis_path: Caminho do CSV Davis.
    """

    def __init__(self, config: Config, arable_path: str = "dados_climaticos_brasil.csv",
                 davis_path: str = "dados_davis_brasil.csv") -> None:
        self.config = config
        self.arable_path = arable_path
        self.davis_path = davis_path

    def _run_arable(self, start: date, end: date) -> pd.DataFrame:
        """Extrai, transforma e consolida o CSV Arable."""
        with ResilientClient(
            timeout=self.config.request_timeout,
            max_retries=self.config.max_retries,
            backoff=self.config.retry_backoff,
        ) as client:
            extractor = ArableExtractor(
                api_key=self.config.arable_api_key,
                stations=self.config.arable_stations,
                base_url=self.config.arable_url,
                client=client,
            )
            df = extractor.fetch_all(start, end)
        merged = upsert(df, self.arable_path)
        write_csv_atomic(merged, self.arable_path)
        return df

    def _run_davis(self, start: date, end: date) -> pd.DataFrame:
        """Extrai, transforma e consolida o CSV Davis."""
        with ResilientClient(
            timeout=self.config.request_timeout,
            max_retries=self.config.max_retries,
            backoff=self.config.retry_backoff,
        ) as client:
            extractor = DavisExtractor(
                api_key=self.config.davis_api_key,
                api_secret=self.config.davis_api_secret,
                stations=self.config.davis_stations,
                base_url=self.config.davis_url,
                chunk_days=self.config.davis_chunk_days,
                client=client,
            )
            raw = extractor.fetch_all(start, end)
        daily = aggregate_davis_records(raw)
        merged = upsert(daily, self.davis_path)
        write_csv_atomic(merged, self.davis_path)
        return daily

    def run(self, start: date, end: date, arable: bool = True, davis: bool = True) -> PipelineResult:
        """Executa o pipeline para o período informado.

        Args:
            start: Data inicial (inclusive).
            end: Data final. O ``DavisExtractor`` usa-a como exclusiva; a
                Arable inclui o dia completo.
            arable: Coletar/atualizar a Arable.
            davis: Coletar/atualizar a Davis.

        Returns:
            ``PipelineResult`` com resumo das linhas atualizadas e totais.
        """
        arable_df = pd.DataFrame()
        davis_df = pd.DataFrame()

        if arable:
            arable_df = self._run_arable(start, end)
            logger.info("Arable atualizado: %d linhas novas no período", len(arable_df))
        if davis:
            davis_df = self._run_davis(start, end)
            logger.info("Davis atualizado: %d linhas diárias no período", len(davis_df))

        def _count(path: str) -> int:
            try:
                total = pd.read_csv(path, dtype=str)
                return len(total)
            except FileNotFoundError:
                return 0

        result = PipelineResult(
            arable_rows=len(arable_df),
            davis_rows=len(davis_df),
            arable_total=_count(self.arable_path),
            davis_total=_count(self.davis_path),
        )
        logger.info(
            "Pipeline concluído: Arable +%d (total %d) | Davis +%d (total %d)",
            result.arable_rows, result.arable_total,
            result.davis_rows, result.davis_total,
        )
        return result


def run_pipeline(config: Config, start: date, end: date, arable: bool = True, davis: bool = True) -> PipelineResult:
    """Atalho para construir e executar o pipeline em uma chamada."""
    return Pipeline(config=config).run(start=start, end=end, arable=arable, davis=davis)