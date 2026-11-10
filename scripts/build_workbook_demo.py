"""Build the default-run workbook (used for checking and as a sample download)."""
import sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend import engine, workbook

if __name__ == "__main__":
    raw = (ROOT / "data" / "online_advertising_performance_data.csv").read_bytes()
    result = engine.run_all(raw, {})
    out = ROOT / "docs" / "sample-results.xlsx"
    out.write_bytes(workbook.build_workbook(result))
    print("wrote", out, out.stat().st_size, "bytes")
