"""Meme Heat Index: daily 0-100 score from xrpl.to market analytics. Writes web/data/heat.json.

Each component is the percentile of its 7-day average among all previous days only (no look-ahead).
"""
import bisect, json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SMOOTH = 7
MIN_HISTORY = 30  # days of history before a percentile is meaningful


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def sma(xs, n=SMOOTH):
    return [sum(xs[max(0, i - n + 1):i + 1]) / len(xs[max(0, i - n + 1):i + 1]) for i in range(len(xs))]


def expanding_pct(xs):
    """Percentile (0-100) of xs[i] among xs[:i+1] only; ties count half."""
    seen, out = [], []
    for x in xs:
        bisect.insort(seen, x)
        out.append(100 * (bisect.bisect_left(seen, x) + bisect.bisect_right(seen, x)) / 2 / len(seen) if len(seen) >= MIN_HISTORY else None)
    return out


def main():
    weights = json.loads((ROOT / "config.json").read_text())["heat"]["weights"]
    daily = sorted(json.loads((ROOT / "raw/market.json").read_text())["daily"], key=lambda d: d["date"])
    rows = [{
        "d": d["date"][:10], "volume": num(d.get("volume")), "trades": num(d.get("trades")),
        "avg_trade": num(d.get("avgTradeSize")), "marketcap": num(d.get("marketcap")),
        "unique_traders": num(d.get("uniqueTradersAMM")) + num(d.get("uniqueTradersNonAMM")),
        "amm_create": num(d.get("ammCreate")),
        "fl_volume": num((d.get("volumeByPlatform") or {}).get("FirstLedger", {}).get("volume")),
        "fl_trades": num((d.get("volumeByPlatform") or {}).get("FirstLedger", {}).get("trades")),
        "plat": {k: round(num(v.get("volume"))) for k, v in (d.get("volumeByPlatform") or {}).items()},
    } for d in daily]
    # FirstLedger has no data before its launch, and today's row is still incomplete
    rows = rows[next(i for i, r in enumerate(rows) if r["fl_volume"] > 0):]
    if rows[-1]["d"] >= datetime.now(timezone.utc).strftime("%Y-%m-%d"):
        rows = rows[:-1]

    series = {k: [r[k] for r in rows] for k in ("fl_volume", "fl_trades", "amm_create", "unique_traders")}
    series["turnover"] = [r["volume"] / r["marketcap"] if r["marketcap"] else 0 for r in rows]
    pct = {k: expanding_pct(sma(v)) for k, v in series.items()}
    p_trades, p_avg = expanding_pct(sma([r["trades"] for r in rows])), expanding_pct(sma([r["avg_trade"] for r in rows]))
    # retail = many trades of small size
    pct["retail"] = [None if a is None or b is None else (a - b + 100) / 2 for a, b in zip(p_trades, p_avg)]

    days = []
    for i, r in enumerate(rows):
        comp = {k: pct[k][i] for k in weights}
        if None in comp.values():
            continue
        score = sum(weights[k] * comp[k] for k in weights) / sum(weights.values())
        days.append({"d": r["d"], "score": round(score, 1), "comp": {k: round(v, 1) for k, v in comp.items()}, "plat": r["plat"]})

    out = ROOT / "web/data/heat.json"
    out.write_text(json.dumps({"schema_version": 1, "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "days": days}))
    print(f"heat: {len(days)} days, {days[0]['d']} .. {days[-1]['d']}, latest {days[-1]['score']}")


if __name__ == "__main__":
    main()
