"""Download raw daily data into raw/: xrpl.to market analytics (2 calls) and Binance daily candles (1 per pair).

Never retries: on an HTTP error it stops and prints Retry-After, so a bad day can't get the IP banned.
XRPLTO_API_KEY is optional (environment variable).
"""
import json, os, sys, time, urllib.error, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
START = "2024-01-01"


def fetch(url, headers=None):
    req = urllib.request.Request(url, headers={"User-Agent": "xrpl-risk-radar/1.0", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"{url} -> HTTP {e.code}, Retry-After={e.headers.get('retry-after')}. Stopping, no retries.")


def xrplto(path):
    key = os.environ.get("XRPLTO_API_KEY")
    return fetch("https://api.xrpl.to/v1" + path, {"X-API-Key": key} if key else None)


if __name__ == "__main__":
    RAW.mkdir(exist_ok=True)
    config = json.loads((ROOT / "config.json").read_text())
    (RAW / "market.json").write_text(json.dumps(xrplto(f"/token/analytics/market?startDate={START}")))
    time.sleep(2)
    (RAW / "marketcap.json").write_text(json.dumps(xrplto(f"/stats/marketcap-history?from={START}")))
    # data-api.binance.vision is Binance's market-data mirror; unlike api.binance.com it isn't geo-blocked in the US (GitHub runners)
    for pair in config["macro"]["pairs"]:
        klines = fetch(f"https://data-api.binance.vision/api/v3/klines?symbol={pair['symbol']}&interval=1d&limit=1000")
        (RAW / f"{pair['symbol']}.json").write_text(json.dumps(klines))
    print("ingest ok")
