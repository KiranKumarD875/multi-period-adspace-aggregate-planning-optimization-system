"""Write the default-run result as a bundled JSON fixture for the web app's offline demo."""
import json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend import engine

if __name__ == "__main__":
    raw = (ROOT / "data" / "online_advertising_performance_data.csv").read_bytes()
    result = engine.run_all(raw, {}, "online_advertising_performance_data.csv")
    out = ROOT / "frontend" / "src" / "data" / "sample-result.json"
    out.write_text(json.dumps(result, separators=(",", ":")))
    print("wrote", out, round(out.stat().st_size / 1024), "KB")
