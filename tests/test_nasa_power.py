"""Testes do extrator NASA POWER (série de comparação)."""

from datetime import date

from climaticos.config import OUTPUT_COLUMNS, Station
from climaticos.extract.nasa_power import NasaPowerExtractor, hargreaves_eto

STATION = Station(id=13917, device="DV13917", site="Corteva Passo Fundo",
                  city="Passo Fundo", state="RS", lat=-28.12846, lon=-52.30285)


def _payload(**overrides):
    days = ["20261001", "20261002"]
    base = {
        "T2M": 20.0, "T2M_MAX": 27.0, "T2M_MIN": 13.0, "RH2M": 70.0, "PRECTOTCORR": 12.34,
        "WS10M": 2.5, "WS10M_MAX": 6.1, "WS10M_MIN": 0.4, "WD10M": 90.0,
        "ALLSKY_SFC_SW_DWN": 18.2, "TOA_SW_DWN": 38.0,
    }
    base.update(overrides)
    # 2º dia ainda não publicado: tudo em fill_value
    parameter = {name: {days[0]: value, days[1]: -999.0} for name, value in base.items()}
    return {"header": {"fill_value": -999.0}, "properties": {"parameter": parameter}}


class FakeClient:
    def __init__(self, payload):
        self.payload = payload
        self.params = None

    def get_json(self, url, params=None, **kwargs):
        self.params = params
        return self.payload


class TestNasaPower:
    def test_maps_station_series(self):
        client = FakeClient(_payload())
        df = NasaPowerExtractor((STATION,), "https://x", client=client).fetch_all(
            date(2026, 10, 1), date(2026, 10, 2))

        assert client.params["latitude"] == STATION.lat
        assert client.params["community"] == "AG"
        assert client.params["start"] == "20261001"
        assert list(df.columns) == list(OUTPUT_COLUMNS)
        assert len(df) == 1, "dias só com fill_value não devem gerar linha"
        row = df.iloc[0]
        assert row["device"] == "DV13917"
        assert row["date"] == "2026-10-01"
        assert row["precip"] == 12.3
        assert row["wind_speed"] == 1.9      # 2,5 m/s a 10 m × 0,748
        assert row["wind_speed_max"] == 4.6  # 6,1 × 0,748
        assert row["wind_dir"] == "E"
        assert row["swdw"] == 18.2
        assert row["et"] == hargreaves_eto(20.0, 27.0, 13.0, 38.0)

    def test_partial_fill_values_become_none(self):
        payload = _payload()
        payload["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]["20261001"] = -999.0
        df = NasaPowerExtractor((STATION,), "https://x", client=FakeClient(payload)).fetch_all(
            date(2026, 10, 1), date(2026, 10, 1))
        assert df.iloc[0]["swdw"] is None
        assert df.iloc[0]["precip"] == 12.3

    def test_station_without_coordinates_skipped(self):
        no_coords = Station(id=0, device="X", site="S", city="C", state="PR")
        df = NasaPowerExtractor((no_coords,), "https://x", client=FakeClient(_payload())).fetch_all(
            date(2026, 10, 1), date(2026, 10, 1))
        assert df.empty


class TestHargreaves:
    def test_typical_value(self):
        # 0,0023 × 37,8 × √14 × 38 × 0,408 ≈ 5,04 mm/dia
        assert hargreaves_eto(20.0, 27.0, 13.0, 38.0) == 5.0

    def test_missing_input(self):
        assert hargreaves_eto(None, 27.0, 13.0, 38.0) is None
