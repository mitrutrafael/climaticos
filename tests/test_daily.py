"""Testes da agregação diária dos registros brutos da Davis."""

import pandas as pd

from climaticos.transform.daily import aggregate_davis_records


def _rec(device="DV13917", day="2026-07-01 12:00:00", **overrides):
    base = {
        "device": device,
        "site": "Corteva Passo Fundo",
        "city": "Passo Fundo",
        "state": "RS",
        "ts": int(pd.Timestamp("2026-07-01T12:00:00+00:00").timestamp()),
        "tz_offset": -10800,
        "lat": -28.12846,
        "lon": -52.30285,
    }
    if overrides.get("day"):
        base["ts"] = int(pd.Timestamp(f"{overrides['day']}T12:00:00+00:00").timestamp())
        overrides.pop("day")
    base.update(overrides)
    return base


class TestAggregation:
    def test_daily_mean_temp(self):
        records = [
            _rec(temp_out=86.0, temp_out_hi=95.0, temp_out_lo=59.0, hum_out=60,
                 rainfall_mm=5.0, et=0.1, wind_speed_avg=4.0,
                 wind_dir_of_prevail=90.0, solar_rad_avg=250.0),
            _rec(temp_out=95.0, temp_out_hi=100.0, temp_out_lo=60.0, hum_out=70,
                 rainfall_mm=3.0, et=0.15, wind_speed_avg=4.0,
                 wind_dir_of_prevail=90.0, solar_rad_avg=250.0),
        ]
        df = aggregate_davis_records(records)
        row = df.iloc[0]

        # 86°F=30.0°C, 95°F=35.0°C → média 32.5; máx 100°F=37.8; mín 59°F=15.0
        assert row["date"] == "2026-07-01"
        assert row["tair_mean"] == 32.5
        assert row["tair_max"] == 37.8
        assert row["tair_min"] == 15.0
        assert row["rh_mean"] == 65.0
        assert row["precip"] == 8.0
        assert row["et"] == 6.3  # (0.1 + 0.15) in → mm, banker's rounding
        assert row["wind_speed"] == 1.8  # 4 mph ≈ 1.78816 → round1 = 1.8
        assert row["wind_dir"] == "E"
        assert row["swdw"] == 250.0
        assert row["vpd"] is not None

    def test_multiple_stations_separated(self):
        records = [
            _rec(device="DV13917", ts=pd.Timestamp("2026-07-01T12:00:00+00:00").timestamp()),
            _rec(device="DV16450", ts=pd.Timestamp("2026-07-01T12:00:00+00:00").timestamp()),
        ]
        df = aggregate_davis_records(records)
        assert len(df) == 2
        assert set(df["device"]) == {"DV13917", "DV16450"}

    def test_empty_input(self):
        df = aggregate_davis_records([])
        assert df.empty
        assert df.columns.tolist() == [
            "device", "site", "city", "state", "date", "tair_mean", "tair_max",
            "tair_min", "rh_mean", "precip", "et", "wind_speed", "wind_dir",
            "vpd", "swdw", "ndvi", "lat", "lon",
        ]