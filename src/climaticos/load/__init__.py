"""Camada de carga: consolidação e escrita dos CSVs."""

from .csv_loader import upsert, write_csv_atomic

__all__ = ["upsert", "write_csv_atomic"]