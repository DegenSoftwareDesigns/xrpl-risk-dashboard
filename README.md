# XRPL Risk Radar

A daily dashboard that answers one question for XRPL traders: **risk-on or risk-off?**

It combines two signals:

- **Macro trend** of BTC/USD, XRP/USD and XRP/BTC: a 0–100 score per pair built from EMA 21, SMA 50, SMA 200, MACD (12, 26, 9) and RSI 14 on daily candles.
- **XRPL Meme Heat**: a 0–100 index of meme activity on the XRPL (FirstLedger volume and trades, new AMM pools, unique traders, turnover, retail share), each measured as a percentile against its own history.

The verdict rules, weights and thresholds live in `config.json`.

A heuristic to organize information, not financial advice. Data by [xrpl.to](https://xrpl.to), prices by Binance.

## How it works

```
pipeline/ingest.py   5 API calls/day -> raw/            (xrpl.to x2, Binance x3)
pipeline/heat.py     raw/ -> web/data/heat.json         (Meme Heat Index)
pipeline/macro.py    raw/ -> web/data/macro.json        (indicators and trend scores)
pipeline/verdict.py  -> web/data/verdict.json           (daily verdict)
web/                 static site that reads web/data/*.json
```

The site never calls an API. Python 3.10+ with the standard library only; no dependencies.

```bash
python pipeline/update.py            # fetch + recompute
python pipeline/update.py --offline  # recompute from raw/ without API calls
python -m http.server 8000 -d web    # preview at http://localhost:8000
```

## Theming

All colors, fonts and radii are tokens in `web/theme.css`. Nothing else hardcodes a color, and charts read the tokens at runtime. To apply a brand, replace that file. Chart color tokens must be 6-digit hex.

## Languages

English by default, Spanish available. Strings live in `web/locales/*.json`; add a file and a button in `web/index.html` to add a language.
