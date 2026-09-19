"""Conversões de unidades e cálculos meteorológicos."""

from __future__ import annotations

import math
from typing import Any

_COMPASS = (
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S",
    "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
)


def to_float(value: Any) -> float | None:
    """Converte o valor para ``float``, retornando ``None`` se inválido."""
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def round1(value: Any) -> float | None:
    """Arredonda para 1 casa decimal, preservando ``None``."""
    f = to_float(value)
    return round(f, 1) if f is not None else None


def fahrenheit_to_celsius(f: Any) -> float | None:
    """Converte Fahrenheit para Celsius (1 casa decimal)."""
    f_value = to_float(f)
    if f_value is None:
        return None
    return round((f_value - 32) * 5 / 9, 1)


def inches_to_mm(inches: Any) -> float | None:
    """Converte polegadas para milímetros (1 casa decimal)."""
    i = to_float(inches)
    return round(i * 25.4, 1) if i is not None else None


def mph_to_ms(mph: Any) -> float | None:
    """Converte milhas/hora para m/s (2 casas decimais)."""
    m = to_float(mph)
    return round(m * 0.44704, 2) if m is not None else None


def deg_to_compass(deg: Any) -> str:
    """Converte graus para direção cardinal de 16 pontos.

    Retorna string vazia para valores inválidos (NaN/negativos).

    Args:
        deg: Ângulo em graus (0° = N).
    """
    f = to_float(deg)
    if f is None or f < 0:
        return ""
    idx = math.floor(((f % 360) + 11.25) / 22.5) % 16
    return _COMPASS[idx]


def calc_vpd(temp_c: Any, rh_percent: Any) -> float | None:
    """Calcula o déficit de pressão de vapor (kPa).

    Fórmula de Tetens: ``es = 0.6108 * exp(17.27*T/(T+237.3))`` e
    ``vpd = es - es * RH/100``.

    Args:
        temp_c: Temperatura média em °C.
        rh_percent: Umidade relativa média em %.
    """
    t = to_float(temp_c)
    rh = to_float(rh_percent)
    if t is None or rh is None:
        return None
    es = 0.6108 * math.exp(17.27 * t / (t + 237.3))
    ea = es * (rh / 100)
    return round(es - ea, 2)


def rh_ratio_to_percent(ratio: Any, decimals: int = 1) -> float | None:
    """Converte umidade relativa em fração (0–1) para percentual.

    Args:
        ratio: Valor fracionário (ex.: ``0.345``).
        decimals: Casas decimais do resultado.

    Returns:
        Percentual arredondado (ex.: ``34.5``) ou ``None``.
    """
    f = to_float(ratio)
    if f is None:
        return None
    return round(f * 100, decimals)