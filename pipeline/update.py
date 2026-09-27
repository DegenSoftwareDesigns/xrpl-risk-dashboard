"""Run the whole pipeline. `--offline` recomputes from raw/ without calling any API."""
import runpy, sys
from pathlib import Path

steps = ["heat", "macro", "verdict"] if "--offline" in sys.argv else ["ingest", "heat", "macro", "verdict"]
for step in steps:
    runpy.run_path(str(Path(__file__).parent / f"{step}.py"), run_name="__main__")
