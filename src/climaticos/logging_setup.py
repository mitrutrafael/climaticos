"""Configuração de logging estruturado do pipeline."""

from __future__ import annotations

import logging
import sys

_FORMAT = "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def setup_logging(level: int = logging.INFO) -> None:
    """Configura o logger raiz com formato estruturado em stderr.

    Args:
        level: Nível mínimo de log (padrão ``logging.INFO``).
    """
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter(_FORMAT, datefmt=_DATE_FORMAT))
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)


def get_logger(name: str) -> logging.Logger:
    """Retorna um logger nomeado sob o namespace ``climaticos``.

    Args:
        name: nome do módulo (ex.: ``climaticos.extract.davis``).

    Returns:
        Instância de ``logging.Logger``.
    """
    return logging.getLogger(name if name.startswith("climaticos") else f"climaticos.{name}")