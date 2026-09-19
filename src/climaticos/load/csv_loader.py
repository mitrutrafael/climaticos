"""Gravação consolida dados: merge com histórico e escrita atômica."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pandas as pd

from ..config import OUTPUT_COLUMNS
from ..logging_setup import get_logger

logger = get_logger("load.csv_loader")


def _normalize_types(df: pd.DataFrame) -> pd.DataFrame:
    """Ajusta tipos das colunas numéricas e da data para consistência."""
    df = df.copy()
    numeric = [c for c in OUTPUT_COLUMNS if c not in ("device", "site", "city", "state", "date", "wind_dir")]
    for col in numeric:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.strftime("%Y-%m-%d")
    return df


def upsert(df_new: pd.DataFrame, path: str | Path) -> pd.DataFrame:
    """Faz o *merge* (upsert por ``device + date``) com o arquivo existente.

    Mantém o histórico antigo e substitui apenas as linhas do período novo.
    Quando o arquivo não existe, retorna o DataFrame novo.

    Args:
        df_new: Dados recém-extraídos no schema ``OUTPUT_COLUMNS``.
        path: Caminho do CSV existente (ou destino).

    Returns:
        Dataset consolidado, ordenado por ``device`` e ``date``.
    """
    df_new = _normalize_types(df_new)
    path = Path(path)

    if path.exists():
        existing = pd.read_csv(path, dtype=str)
        existing = _normalize_types(existing)
        merged = pd.concat([existing, df_new], ignore_index=True)
        logger.info("Merge: %d existentes + %d novos", len(existing), len(df_new))
    else:
        merged = df_new
        logger.info("Arquivo %s não existe — criando novo", path)

    merged = merged.drop_duplicates(subset=["device", "date"], keep="last")
    merged = merged.sort_values(["device", "date"]).reset_index(drop=True)
    merged = merged[list(OUTPUT_COLUMNS)]
    return merged


def write_csv_atomic(df: pd.DataFrame, path: str | Path) -> None:
    """Escreve o CSV em arquivo temporário e renomeia (gravação atômica).

    Evita arquivos corrompidos caso o processo seja interrompido no meio da
    escrita, mantendo UTF-8 sem BOM para compatibilidade com o browser.

    Args:
        df: DataFrame no schema ``OUTPUT_COLUMNS``.
        path: Caminho final do arquivo.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as handle:
            df.to_csv(handle, index=False, encoding="utf-8")
        os.replace(tmp_path, path)
    except BaseException:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
    logger.info("CSV atômico gravado: %s (%d linhas)", path, len(df))