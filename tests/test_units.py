"""Testes das conversões de unidades e cálculos meteorológicos."""

import math

from climaticos.transform.units import (
    calc_vpd,
    deg_to_compass,
    fahrenheit_to_celsius,
    inches_to_mm,
    mph_to_ms,
    rh_ratio_to_percent,
    round1,
    to_float,
)


class TestUnitConversions:
    def test_fahrenheit_to_celsius(self):
        assert fahrenheit_to_celsius(32) == 0.0
        assert fahrenheit_to_celsius(212) == 100.0
        assert fahrenheit_to_celsius(None) is None

    def test_inches_to_mm(self):
        assert inches_to_mm(1.0) == 25.4
        assert inches_to_mm(0) == 0.0

    def test_mph_to_ms(self):
        # 1 mph = 0.44704 m/s
        assert mph_to_ms(1) == 0.45
        assert mph_to_ms(0) == 0.0

    def test_to_float_invalid(self):
        assert to_float(None) is None
        assert to_float("abc") is None
        assert to_float("") is None
        assert to_float(math.inf) is None
        assert to_float(math.nan) is None

    def test_round1_preserves_none(self):
        assert round1(None) is None
        assert round1("12.345") == 12.3


class TestVpd:
    def test_vpd_high_rh_low_delta(self):
        # UR alta (~100%) → VPD próximo de zero
        vpd = calc_vpd(25.0, 95.0)
        assert vpd is not None
        assert 0.0 <= vpd < 0.4

    def test_vpd_low_rh_high_delta(self):
        # UR baixa → VPD maior
        vpd = calc_vpd(25.0, 40.0)
        assert vpd is not None
        assert vpd > 1.5

    def test_vpd_missing_returns_none(self):
        assert calc_vpd(None, 50.0) is None
        assert calc_vpd(25.0, None) is None


class TestCompass:
    def test_cardinal_points(self):
        assert deg_to_compass(0) == "N"
        assert deg_to_compass(90) == "E"
        assert deg_to_compass(180) == "S"
        assert deg_to_compass(270) == "W"

    def test_invalid_compass(self):
        assert deg_to_compass(None) == ""
        assert deg_to_compass(-5) == ""
        assert deg_to_compass("abc") == ""


class TestRhRatio:
    def test_ratio_to_percent(self):
        assert rh_ratio_to_percent(0.345) == 34.5
        assert rh_ratio_to_percent(None) is None
        assert rh_ratio_to_percent(1.0) == 100.0