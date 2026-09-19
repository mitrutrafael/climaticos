"""Testes do merge (upsert) e da escrita atômica do CSV."""

import pandas as pd

from climaticos.load.csv_loader import upsert, write_csv_atomic

COLUMNS = [
    "device", "site", "city", "state", "date", "tair_mean", "tair_max",
    "tair_min", "rh_mean", "precip", "et", "wind_speed", "wind_dir",
    "vpd", "swdw", "ndvi", "lat", "lon",
]


def _row(device="D006582", day="2026-07-01", tair=25.0) -> dict:
    return {
        "device": device, "site": "BW Mogi Mirim", "city": "Mogi Mirim",
        "state": "SP", "date": day, "tair_mean": tair,
        "tair_max": None, "tair_min": None, "rh_mean": None, "precip": None,
        "et": None, "wind_speed": None, "wind_dir": "", "vpd": None,
        "swdw": None, "ndvi": None, "lat": None, "lon": None,
    }


class TestUpsert:
    def test_creates_new_file(self, tmp_path):
        path = tmp_path / "out.csv"
        df = pd.DataFrame([_row()], columns=COLUMNS)
        merged = upsert(df, path)
        assert next(iter(merged.itertuples(index=False, name=None)))[0] == "D006582"

    def test_merge_keeps_history(self, tmp_path):
        path = tmp_path / "out.csv"
        old = pd.DataFrame([_row(day="2026-06-01")] + [_row(day="2026-06-02")], columns=COLUMNS)
        write_csv_atomic(old, path)

        new = pd.DataFrame([_row(day="2026-07-01")], columns=COLUMNS)
        merged = upsert(new, path)
        dates = sorted(merged["date"])
        assert dates == ["2026-06-01", "2026-06-02", "2026-07-01"]

    def test_upsert_replaces_duplicate(self, tmp_path):
        path = tmp_path / "out.csv"
        old = pd.DataFrame([_row(day="2026-07-01", tair=24.0)], columns=COLUMNS)
        write_csv_atomic(old, path)

        new = pd.DataFrame([_row(day="2026-07-01", tair=28.5)], columns=COLUMNS)
        merged = upsert(new, path)
        assert len(merged) == 1
        assert merged.iloc[0]["tair_mean"] == 28.5

    def test_output_columns_ordered(self, tmp_path):
        path = tmp_path / "out.csv"
        merged = upsert(pd.DataFrame([_row()], columns=COLUMNS), path)
        assert list(merged.columns) == COLUMNS


class TestAtomicWrite:
    def test_writes_roundtrip(self, tmp_path):
        path = tmp_path / "out.csv"
        write_csv_atomic(pd.DataFrame([_row()], columns=COLUMNS), path)
        back = pd.read_csv(path)
        assert len(back) == 1
        assert back.iloc[0]["device"] == "D006582"