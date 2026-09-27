"""Combine macro score and Meme Heat into a daily risk-on / risk-off verdict. Writes web/data/verdict.json."""
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def verdict(macro, heat, t):
    if macro < t["risk_off"]:
        return "risk_off"
    if macro < t["risk_on"]:
        return "neutral"
    if heat > t["heat_hot"]:
        return "risk_on_late"
    if heat < t["heat_cold"]:
        return "neutral_early"
    return "risk_on"


def main():
    t = json.loads((ROOT / "config.json").read_text())["verdict"]
    macro = {m["d"]: m["score"] for m in json.loads((ROOT / "web/data/macro.json").read_text())["macro"]}
    heat = {h["d"]: h["score"] for h in json.loads((ROOT / "web/data/heat.json").read_text())["days"]}
    days = [{"d": d, "macro": macro[d], "heat": heat[d], "v": verdict(macro[d], heat[d], t)} for d in sorted(macro) if d in heat]
    (ROOT / "web/data/verdict.json").write_text(json.dumps({
        "schema_version": 1, "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "thresholds": t, "days": days}))
    print(f"verdict: {days[-1]}")


if __name__ == "__main__":
    main()
