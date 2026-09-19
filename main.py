"""Ponto de entrada da CLI do ETL climático.

Uso:
    python main.py [--days N] [--start YYYY-MM-DD] [--end YYYY-MM-DD]
                   [--arable-only | --davis-only] [--log-level DEBUG]
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import date

from climaticos.config import default_date_range, load_config
from climaticos.logging_setup import setup_logging
from climaticos.pipeline import run_pipeline


def _parse_date(value: str) -> date:
    """Converte string ``YYYY-MM-DD`` para ``date`` ou aborta a execução."""
    try:
        return date.fromisoformat(value)
    except ValueError:
        sys.exit(f"Data inválida '{value}'. Use o formato YYYY-MM-DD.")


def build_parser() -> argparse.ArgumentParser:
    """Constrói o parser de argumentos da CLI."""
    parser = argparse.ArgumentParser(
        prog="climaticos",
        description="ETL climático: coleta Arable e Davis e consolida os CSVs do dashboard.",
    )
    parser.add_argument("--days", type=int, default=None,
                        help="Quantos dias de histórico coletar (padrão: config).")
    parser.add_argument("--start", type=_parse_date, default=None,
                        help="Data inicial (inclusive) — YYYY-MM-DD.")
    parser.add_argument("--end", type=_parse_date, default=None,
                        help="Data final — YYYY-MM-DD. Para a Davis é exclusiva (padrão: hoje).")
    parser.add_argument("--log-level", default="INFO",
                        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
                        help="Nível de log (padrão: INFO).")
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--arable-only", action="store_true",
                        help="Atualizar apenas o CSV Arable.")
    source.add_argument("--davis-only", action="store_true",
                        help="Atualizar apenas o CSV Davis.")
    return parser


def main(argv: list[str] | None = None) -> int:
    """Executa o pipeline a partir dos argumentos da linha de comando."""
    args = build_parser().parse_args(argv)
    setup_logging(getattr(logging, args.log_level))
    logger = logging.getLogger("climaticos.cli")

    try:
        config = load_config()
    except RuntimeError as exc:
        logger.error(exc)
        return 1

    if args.start and args.end:
        start, end = args.start, args.end
    else:
        start, end = default_date_range(days=args.days)
        logger.info("Período padrão: %s a %s (%d dias)", start, end, (end - start).days)

    arable = not args.davis_only
    davis = not args.arable_only

    try:
        result = run_pipeline(config, start, end, arable=arable, davis=davis)
    except Exception:
        logger.exception("Pipeline falhou")
        return 1

    logger.info(
        "OK. Arable: %d linhas no período (total %d) · Davis: %d linhas no período (total %d)",
        result.arable_rows, result.arable_total,
        result.davis_rows, result.davis_total,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())