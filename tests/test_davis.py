"""Testes da coleta Davis: janelas em fuso local, duplicatas e dias incompletos."""

from datetime import date, datetime

from climaticos.config import Station
from climaticos.extract.davis import DavisExtractor
from climaticos.transform.daily import aggregate_davis_records

STATION = Station(id=13917, device="DV13917", site="Corteva Passo Fundo",
                  city="Passo Fundo", state="RS", lat=-28.1, lon=-52.3)
TZ = -10800  # UTC-3
HOUR = 3600


def _ts(day: str, hour_utc: int) -> int:
    return int(datetime.fromisoformat(f"{day}T00:00:00+00:00").timestamp()) + hour_utc * HOUR


class HourlyClient:
    """Simula a WeatherLink: 1 registro por hora com 1 mm de chuva, janela fechada [since, until]."""

    def __init__(self):
        self.windows = []

    def get_json(self, url, headers=None):
        params = dict(p.split("=") for p in url.split("?")[1].split("&"))
        since, until = int(params["start-timestamp"]), int(params["end-timestamp"])
        self.windows.append((since, until))
        data = [
            {"ts": ts, "tz_offset": TZ, "rainfall_mm": 1.0, "temp_out": 68.0}
            for ts in range(since - since % HOUR, until + 1, HOUR)
            if since <= ts <= until
        ]
        return {"sensors": [{"lsid": 1, "data": data}]}


class TestDavisWindows:
    def test_fetch_covers_local_days_and_dedups(self):
        client = HourlyClient()
        ext = DavisExtractor("k", "s", (STATION,), "https://x", client=client)
        raw = ext.fetch_all(date(2026, 9, 10), date(2026, 9, 13))

        # coleta de 09-09 00Z a 09-14 00Z (1 dia de folga em cada borda)
        assert client.windows[0][0] == _ts("2026-09-09", 0)
        assert client.windows[-1][1] == _ts("2026-09-14", 0)
        ts = [r["ts"] for r in raw]
        assert len(ts) == len(set(ts)), "registros da borda entre janelas não podem duplicar"

        daily = aggregate_davis_records(raw, min_hours=20).set_index("date")
        # dias locais pedidos ficam completos: 24 h × 1 mm
        for day in ("2026-09-10", "2026-09-11", "2026-09-12"):
            assert daily.loc[day, "precip"] == 24.0
        # 09-08 local tem só 21h–24h (3 registros) → descartado
        assert "2026-09-08" not in daily.index

    def test_partial_day_dropped_but_kept_without_threshold(self):
        recs = [
            {"device": "DV13917", "ts": _ts("2026-09-13", h), "tz_offset": TZ, "rainfall_mm": 2.0}
            for h in range(3)  # 21h–23h locais de 09-12
        ]
        assert aggregate_davis_records(recs, min_hours=20).empty
        assert aggregate_davis_records(recs).iloc[0]["precip"] == 6.0


class TestRainFallbacks:
    def _day(self, **fields):
        recs = [{"device": "DV13917", "ts": _ts("2026-09-10", 15), "tz_offset": TZ, **fields}]
        return aggregate_davis_records(recs).iloc[0]["precip"]

    def test_rainfall_mm(self):
        assert self._day(rainfall_mm=3.2, rainfall_in=9.0) == 3.2

    def test_rainfall_in(self):
        assert self._day(rainfall_in=0.5) == 12.7

    def test_clicks_metric_bucket(self):
        assert self._day(rainfall_clicks=15, rain_size=2) == 3.0

    def test_clicks_imperial_bucket(self):
        assert self._day(rainfall_clicks=10, rain_size=1) == 2.5


def test_pipeline_drops_border_days(tmp_path, monkeypatch):
    from climaticos import pipeline as pl
    from climaticos.config import Config

    client = HourlyClient()
    monkeypatch.setattr(pl, "ResilientClient", lambda **kw: _Ctx(client))
    cfg = Config(arable_api_key="a", davis_api_key="k", davis_api_secret="s", davis_stations=(STATION,))
    p = pl.Pipeline(cfg, arable_path=str(tmp_path / "a.csv"), davis_path=str(tmp_path / "d.csv"))
    df = p._run_davis(date(2026, 9, 10), date(2026, 9, 13))
    assert sorted(df["date"]) == ["2026-09-10", "2026-09-11", "2026-09-12"]
    assert set(df["precip"]) == {24.0}


class _Ctx:
    def __init__(self, client):
        self.client = client

    def __enter__(self):
        return self.client

    def __exit__(self, *exc):
        return False
