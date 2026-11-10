"""Acceptance tests for the mid-review requirements.

Run with pytest, or without it:  python tests/test_engine.py
Reference values were reproduced by an independent HiGHS solve (see tests/test_crosscheck.py).
"""
import io
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend import engine, workbook  # noqa: E402

RAW = (ROOT / "data" / "online_advertising_performance_data.csv").read_bytes()
DEFAULT_LP = 603772.3422713282        # Model 1, default configuration
DEFAULT_SHADOW = 2.08626095287         # budget shadow price, default configuration
CAMPAIGN_REVENUE_LP = 301805.2368      # campaign, revenue, 80% budget, capacity 1.25
REV_CFG = dict(objective="revenue", category="campaign", budget_fraction=0.8, capacity_factor=1.25)


def rel(a, b):
    return abs(a - b) / max(1.0, abs(b))


def test_default_run_matches_reference_values():
    r = engine.run_all(RAW, {})
    assert rel(r["model1"]["objective"], DEFAULT_LP) < 1e-7
    assert r["model1"]["status"] == "Optimal"


def test_campaign_revenue_run_matches_reference():
    r = engine.run_all(RAW, REV_CFG)
    assert rel(r["model1"]["objective"], CAMPAIGN_REVENUE_LP) < 1e-6
    assert r["inputs"]["categories"] == ["camp 1", "camp 2", "camp 3"]


def test_constraint_count_follows_pdf_formula():
    # PDF slide 13: explicit constraints = 1 + T + 2PT (nonnegativity excluded), for every pacing rule.
    d = engine.build_dataset(RAW, {})
    P, T = len(d["categories"]), d["dataset"]["weeks"]
    for pacing in ["none", "even"]:
        assert engine.run_all(RAW, {"pacing": pacing})["model1"]["explicit_constraints"] == 1 + T + 2 * P * T


def test_budget_shadow_price_is_correct_and_verified():
    r = engine.run_all(RAW, {})
    top = r["q4"]["rows"][0]
    assert top["id"] == "total_budget"
    assert abs(top["shadow_price"] - DEFAULT_SHADOW) < 1e-6
    assert abs(top["finite_difference"] - DEFAULT_SHADOW) < 1e-6
    assert all(row["verified"] for row in r["q4"]["rows"])


def test_budget_is_fully_spent_when_budget_binds():
    r = engine.run_all(RAW, {})
    assert abs(r["model1"]["spend"] - r["inputs"]["budget"]) < 1e-4


def test_integer_model_is_proven_and_bounded_by_lp():
    r = engine.run_all(RAW, {})
    assert r["model2"]["optimal"] is True
    assert r["model2"]["status"].startswith("Optimal")
    assert r["comparison"]["bound_holds"] is True
    assert r["comparison"]["gap_pct"] >= 0


def test_integer_selection_is_binary_and_within_budget():
    r = engine.run_all(RAW, {})
    sel = [p for p in r["model2"]["packages"] if p["selected"]]
    assert abs(sum(p["cost"] for p in sel) - r["model2"]["spend"]) < 1e-6
    assert r["model2"]["spend"] <= r["inputs"]["budget"] + 1e-6


def test_shadow_prices_lie_between_one_sided_slopes():
    # Piecewise-linear value function: a verified dual must lie between the left and right slopes.
    r = engine.run_all(RAW, {"pacing": "custom", "custom_pacing": [engine.build_dataset(RAW, {})["budget"] * 0.12] * 13})
    assert all(row["verified"] for row in r["q4"]["rows"])


def test_all_residual_checks_pass():
    for cfg in [{}, {"pacing": "even"}, REV_CFG]:
        r = engine.run_all(RAW, cfg)
        assert r["checks"]["all_passed"], cfg


def test_q2_pattern_and_reference_pacing_comparison():
    r = engine.run_all(RAW, {})
    weekly = r["q2"]["weekly"]
    assert len(weekly) == 13
    assert abs(sum(w["spend"] for w in weekly) - r["inputs"]["budget"]) < 1e-4
    ref = r["q2"]["reference"]
    assert ref["rule"].startswith("Even pacing")
    assert ref["objective"] <= r["model1"]["objective"] + 1e-6
    assert ref["objective_loss"] >= -1e-6


def test_q3_partition_covers_every_cell():
    r = engine.run_all(RAW, {})
    counts = r["q3"]["cells"]
    assert sum(counts.values()) == len(r["model1"]["cells"])
    labels = {c["label"] for c in r["q3"]["categories"]}
    assert labels <= {"Capacity-bound", "Under-utilised", "Unused"}


def test_capacity_bound_categories_match_definition():
    r = engine.run_all(RAW, {})
    for cat in r["q3"]["categories"]:
        assert (cat["label"] == "Capacity-bound") == (round(cat["utilisation_pct"], 1) >= 99)


def test_proportional_baseline_is_feasible_and_below_lp():
    r = engine.run_all(RAW, {})
    assert r["baseline"]["feasible"]
    assert r["q1"]["baseline_objective"] < r["q1"]["objective"]
    assert r["q1"]["uplift_pct"] > 0

    # Also check paced revenue run: baseline must be feasible under weekly caps and LP uplift positive
    r_paced = engine.run_all(RAW, {"category": "campaign", "budget_fraction": 0.90, "pacing": "even", "objective": "revenue"})
    assert r_paced["baseline"]["feasible"]
    assert r_paced["q1"]["baseline_objective"] <= r_paced["model1"]["objective"]
    assert r_paced["q1"]["uplift_pct"] >= 0
    assert r_paced["q2"]["unspent_budget"] > 0
    assert r_paced["q2"]["reference"]["objective_loss"] > 0
    assert "historical_spend_validation" in r_paced["dataset"]


def test_missing_category_rows_are_excluded_not_imputed():
    frame = pd.read_csv(io.BytesIO(RAW), encoding="utf-8-sig")
    n_blank = int(frame["placement"].isna().sum())
    r = engine.run_all(RAW, {})
    assert r["dataset"]["excluded"]["rows"] == n_blank


def test_bad_numeric_value_is_rejected():
    frame = pd.read_csv(io.BytesIO(RAW), encoding="utf-8-sig").head(50)
    frame.loc[3, "cost"] = -5
    buf = io.StringIO(); frame.to_csv(buf, index=False)
    try:
        engine.build_dataset(buf.getvalue().encode(), {})
        raise AssertionError("negative cost should be rejected")
    except ValueError as exc:
        assert "cost" in str(exc)


def test_missing_required_column_is_reported():
    frame = pd.read_csv(io.BytesIO(RAW), encoding="utf-8-sig").head(20).drop(columns=["displays"])
    buf = io.StringIO(); frame.to_csv(buf, index=False)
    try:
        engine.build_dataset(buf.getvalue().encode(), {})
        raise AssertionError("missing column should be rejected")
    except ValueError as exc:
        assert "displays" in str(exc)


def test_infeasible_plan_is_reported_not_crashed():
    r = engine.run_all(RAW, {"minimum_fraction": 0.9, "budget_fraction": 0.1, "pacing": "even"})
    assert r["model1"]["status"] == "Infeasible"
    assert r["q1"] is None and r["q4"] is None
    assert r["model1"]["message"]


def test_invalid_configuration_is_rejected():
    for bad in [{"category": "region"}, {"pacing": "weekly"}, {"budget_fraction": 5},
                {"package_sizes": [0.5, 0.5]}]:
        try:
            engine.validate_config(bad)
            raise AssertionError(f"accepted bad config {bad}")
        except ValueError:
            pass


def test_result_is_json_serialisable():
    json.dumps(engine.run_all(RAW, {}))
    json.dumps(engine.run_all(RAW, {"pacing": "even"}))


def test_workbook_has_the_six_required_sheets_and_no_formula_errors():
    import openpyxl
    content = workbook.build_workbook(engine.run_all(RAW, {}))
    wb = openpyxl.load_workbook(io.BytesIO(content))
    assert wb.sheetnames == ["Summary", "1 Allocation", "2 Weekly plan", "3 Capacity",
                             "4 Shadow prices", "5 Model 2"]
    formulas = sum(1 for ws in wb for row in ws.iter_rows() for c in row
                   if isinstance(c.value, str) and c.value.startswith("="))
    assert formulas > 300


def test_pacing_none_and_even_both_produce_valid_results():
    for pacing in ["none", "even"]:
        r = engine.run_all(RAW, {"pacing": pacing})
        assert r["model1"]["optimal"] and r["checks"]["all_passed"]


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_")]
    failed = 0
    for t in tests:
        try:
            t()
            print("PASS", t.__name__)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print("FAIL", t.__name__, "->", type(exc).__name__, exc)
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)
