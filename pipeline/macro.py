"""Technical score (0-100) per pair from Binance daily candles: EMA21, SMA50, SMA200, RSI14, MACD(12,26,9).
Writes web/data/macro.json.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def ema(xs, n):
    k, out = 2 / (n + 1), []
    for x in xs:
        out.append(x if not out else x * k + out[-1] * (1 - k))
    return out


def sma(xs, n):
    return [None if i + 1 < n else sum(xs[i + 1 - n:i + 1]) / n for i in range(len(xs))]


def rsi(xs, n=14):
    """Wilder's RSI."""
    out, gain, loss = [None] * len(xs), 0.0, 0.0
    for i in range(1, len(xs)):
        ch = xs[i] - xs[i - 1]
        g, l = max(ch, 0), max(-ch, 0)
        if i <= n:
            gain, loss = gain + g / n, loss + l / n
        else:
            gain, loss = (gain * (n - 1) + g) / n, (loss * (n - 1) + l) / n
        if i >= n:
            out[i] = 100.0 if loss == 0 else 100 - 100 / (1 + gain / loss)
    return out


def checks(i, c, e21, s50, s200, r, macd, signal, hist):
    return {
        "above_sma200": c[i] > s200[i],
        "sma50_above_sma200": s50[i] > s200[i],
        "above_ema21": c[i] > e21[i],
        "ema21_rising": e21[i] > e21[i - 5],
        "macd_above_signal": macd[i] > signal[i],
        "macd_hist_rising": hist[i] > hist[i - 1],
        "macd_positive": macd[i] > 0,
        "rsi_healthy": 50 <= r[i] <= 70,
        "rsi_neutral": 40 <= r[i] < 50 or 70 < r[i] <= 80,
    }


def sig(x):
    return float(f"{x:.6g}")


def main():
    config = json.loads((ROOT / "config.json").read_text())["macro"]
    points = config["points"]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    pairs, scores_by_day = {}, {}
    for pair in config["pairs"]:
        klines = json.loads((ROOT / f"raw/{pair['symbol']}.json").read_text())
        dates = [datetime.fromtimestamp(k[0] / 1000, timezone.utc).strftime("%Y-%m-%d") for k in klines]
        if dates[-1] >= today:  # today's candle is still open
            klines, dates = klines[:-1], dates[:-1]
        c = [float(k[4]) for k in klines]
        e21, s50, s200, r = ema(c, 21), sma(c, 50), sma(c, 200), rsi(c)
        macd = [a - b for a, b in zip(ema(c, 12), ema(c, 26))]
        signal = ema(macd, 9)
        hist = [a - b for a, b in zip(macd, signal)]
        days = []
        for i in range(len(c)):
            if s200[i] is None:
                continue
            chk = checks(i, c, e21, s50, s200, r, macd, signal, hist)
            score = sum(points[k] for k, ok in chk.items() if ok)
            days.append({"d": dates[i], "c": sig(c[i]), "ema21": sig(e21[i]), "sma50": sig(s50[i]), "sma200": sig(s200[i]),
                         "rsi": round(r[i], 1), "macd": sig(macd[i]), "signal": sig(signal[i]), "hist": sig(hist[i]), "score": score})
            scores_by_day.setdefault(dates[i], {})[pair["symbol"]] = score
        pairs[pair["symbol"]] = {"label": pair["label"], "weight": pair["weight"], "checks": chk, "days": days}
        print(f"macro {pair['label']}: score {days[-1]['score']}, rsi {days[-1]['rsi']}")

    weights = {p["symbol"]: p["weight"] for p in config["pairs"]}
    full = [(d, sum(weights[s] * v for s, v in by.items())) for d, by in sorted(scores_by_day.items()) if len(by) == len(weights)]
    # the point score jumps day to day; the verdict uses its 7-day mean so it doesn't flip on one candle
    n = config["smooth_days"]
    macro = [{"d": d, "raw": round(v, 1), "score": round(sum(x for _, x in full[max(0, i - n + 1):i + 1]) / len(full[max(0, i - n + 1):i + 1]), 1)}
             for i, (d, v) in enumerate(full)]
    out = ROOT / "web/data/macro.json"
    out.write_text(json.dumps({"schema_version": 1, "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                               "points": points, "pairs": pairs, "macro": macro}))
    print(f"macro score latest {macro[-1]}")


if __name__ == "__main__":
    main()
