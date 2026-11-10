"""Cross-check the production solver (PuLP + CBC) against an independent reference (SciPy HiGHS).

Run:  python tests/test_crosscheck.py      (or pytest tests/test_crosscheck.py)

Both solvers must agree on every objective the PDF asks for. The reference is used only here;
the application uses PuLP + CBC by default.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend import engine  # noqa: E402
from backend.solvers import PuLPCBC, HiGHSReference, SolverUnavailable  # noqa: E402

RAW = (ROOT / "data" / "online_advertising_performance_data.csv").read_bytes()
CASES = {
    "default": {},
    "even pacing": {"pacing": "even"},
    "revenue, campaign": {"objective": "revenue", "category": "campaign", "budget_fraction": 0.8, "capacity_factor": 1.25},
    "minimum commitment 20%": {"minimum_fraction": 0.2},
}


def _backends():
    try:
        production = PuLPCBC()
    except SolverUnavailable as exc:
        raise SystemExit(f"PuLP/CBC is not available here: {exc}\n"
                         "Install the backend requirements (pip install -r backend/requirements.txt) and rerun.")
    return production, HiGHSReference()


def rel(a, b):
    return abs(a - b) / max(1.0, abs(b))


def test_pulp_cbc_matches_reference_on_every_case():
    production, reference = _backends()
    for name, cfg in CASES.items():
        p = engine.run_all(RAW, cfg, backend=production)
        h = engine.run_all(RAW, cfg, backend=reference)
        assert p["model1"]["status"] == h["model1"]["status"] == "Optimal", name
        assert rel(p["model1"]["objective"], h["model1"]["objective"]) < 1e-6, f"LP objective differs: {name}"
        assert p["model1"]["explicit_constraints"] == h["model1"]["explicit_constraints"]
        assert p["model2"]["optimal"] and h["model2"]["optimal"], f"IP not proven: {name}"
        assert rel(p["model2"]["objective"], h["model2"]["objective"]) < 1e-6, f"IP objective differs: {name}"
        assert p["checks"]["all_passed"] and h["checks"]["all_passed"], name
        assert all(row["verified"] for row in p["q4"]["rows"]), f"unverified dual with PuLP: {name}"
        print("agree:", name, round(p["model1"]["objective"], 4), round(p["model2"]["objective"], 4))


def test_default_shadow_price_is_the_same_under_both_solvers():
    production, reference = _backends()
    p = engine.run_all(RAW, {}, backend=production)["q4"]["rows"][0]
    h = engine.run_all(RAW, {}, backend=reference)["q4"]["rows"][0]
    assert p["id"] == h["id"] == "total_budget"
    assert abs(p["shadow_price"] - h["shadow_price"]) < 1e-6


if __name__ == "__main__":
    test_pulp_cbc_matches_reference_on_every_case()
    test_default_shadow_price_is_the_same_under_both_solvers()
    print("\nPuLP/CBC agrees with the reference solver on every case.")
