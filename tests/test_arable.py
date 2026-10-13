"""Testes do mapeamento da resposta diária da Arable."""

from datetime import date

from climaticos.config import OUTPUT_COLUMNS, Station
from climaticos.extract.arable import ArableExtractor

STATION = Station(id=0, device="D006582", site="BW Mogi Mirim", city="Mogi Mirim", state="SP")


class FakeClient:
    def __init__(self, payload):
        self.payload = payload

    def get_json(self, url, headers=None, params=None):
        return self.payload


class TestArableMapping:
    def test_maps_wind_fields(self):
        payload = [{
            "time": "2026-07-01T00:00:00Z", "meant": 20.0, "maxt": 27.0, "mint": 13.0,
            "mean_rh": 0.65, "wind_speed": 2.4, "wind_speed_max": 9.1,
            "wind_speed_min": 0.3, "wind_direction": "SE", "lat": -22.4, "long": -47.0,
        }]
        ext = ArableExtractor("key", (STATION,), "https://x", client=FakeClient(payload))
        df = ext.fetch_all(date(2026, 7, 1), date(2026, 7, 2))

        assert list(df.columns) == list(OUTPUT_COLUMNS)
        row = df.iloc[0]
        assert row["date"] == "2026-07-01"
        assert row["rh_mean"] == 65.0
        assert row["wind_speed"] == 2.4
        assert row["wind_speed_max"] == 9.1
        assert row["wind_speed_min"] == 0.3

    def test_device_without_anemometer(self):
        payload = [{"time": "2026-07-01T00:00:00Z", "meant": 20.0}]
        ext = ArableExtractor("key", (STATION,), "https://x", client=FakeClient(payload))
        row = ext.fetch_all(date(2026, 7, 1), date(2026, 7, 2)).iloc[0]
        assert row["wind_speed_max"] is None
        assert row["wind_speed_min"] is None
