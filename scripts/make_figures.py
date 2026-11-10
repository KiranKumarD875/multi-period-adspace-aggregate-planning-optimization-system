"""Static figures for the report, drawn with Matplotlib and Seaborn (PDF slide 8).

Writes PNG files to docs/figures/. The interactive versions live in the web app (Recharts).
Usage: python scripts/make_figures.py          (uses the default solver: PuLP + CBC)
"""
import pathlib
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import seaborn as sns  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend import engine  # noqa: E402

OUT = ROOT / "docs" / "figures"
TEAL, INDIGO, SLATE, AMBER = "#0F766E", "#4F46E5", "#98A2B3", "#B54708"


def style():
    sns.set_theme(style="whitegrid", context="notebook")
    plt.rcParams.update({"figure.dpi": 150, "savefig.bbox": "tight", "font.family": "DejaVu Sans"})


def weekly_figure(r, unit):
    from matplotlib.ticker import FuncFormatter
    weeks = r["q2"]["weekly"]
    fig, ax = plt.subplots(figsize=(9, 4.4))
    labels = [w["label"].replace("Week ", "W") for w in weeks]
    bars = ax.bar(labels, [w["spend"] for w in weeks], color=TEAL, label="Spend ($)")
    ax.set_ylabel("Spend ($)")
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v:,.0f}"))
    ax2 = ax.twinx()
    line, = ax2.plot(labels, [w["conversions"] for w in weeks], color=INDIGO, marker="o",
                     label=f"Objective ({unit})")
    ax2.set_ylabel(f"Objective ({unit})")
    ax2.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v:,.0f}"))
    ax.set_title("Optimal weekly spending pattern (Model 1)")
    ax.legend(handles=[bars, line], loc="upper right", frameon=True)
    ax.grid(axis="x", visible=False)
    fig.savefig(OUT / "q2_weekly_pattern.png")
    plt.close(fig)


def capacity_figure(r):
    cats = r["q3"]["categories"]
    fig, ax = plt.subplots(figsize=(8, 3.8))
    colours = [TEAL if c["label"] == "Capacity-bound" else (SLATE if c["label"] == "Unused" else AMBER) for c in cats]
    ax.barh([c["category"] for c in cats], [c["utilisation_pct"] for c in cats], color=colours)
    ax.invert_yaxis()
    ax.set_xlim(0, 100)
    ax.set_xlabel("Utilisation of capacity (%)")
    ax.set_ylabel("Category")
    ax.set_title("Capacity-bound (teal) vs under-utilised (amber)")
    for i, c in enumerate(cats):
        ax.text(c["utilisation_pct"] + 1, i, f"{c['utilisation_pct']:.1f}%", va="center")
    fig.savefig(OUT / "q3_capacity_utilisation.png")
    plt.close(fig)


def shadow_figure(r, unit):
    rows = r["q4"]["rows"][:10]
    fig, ax = plt.subplots(figsize=(9, 4.8))
    names = [x["label"].split("  ")[0] if "  " in x["label"] else x["label"] for x in rows]
    sns.barplot(x=[x["shadow_price"] for x in rows], y=names, color=TEAL, ax=ax)
    for i, x in enumerate(rows):
        ax.text(x["shadow_price"], i, f"  {x['shadow_price']:.6f}", va="center", fontsize=8)
    ax.set_xlim(0, max(x["shadow_price"] for x in rows) * 1.15)
    ax.set_xlabel(f"Shadow price ({unit} per +1 unit of the limit)")
    ax.set_title("Ten largest shadow prices (dual values)")
    fig.savefig(OUT / "q4_shadow_prices.png")
    plt.close(fig)


def comparison_figure(r, unit):
    c = r["comparison"]
    names = ["Proportional split", "Model 1 · LP", "Model 2 · IP"]
    values = [c["baseline"], c["lp"], c["ip"]]
    fig, ax = plt.subplots(figsize=(8, 3.2))
    sns.barplot(x=values, y=names, palette=[SLATE, TEAL, INDIGO], ax=ax, hue=names, legend=False)
    lo = min(values) * 0.97
    ax.set_xlim(lo, max(values) * 1.005)
    ax.set_xlabel(f"Expected {unit}")
    ax.set_title("Same budget, three plans")
    for i, v in enumerate(values):
        ax.text(v, i, f"  {v:,.0f}", va="center")
    fig.savefig(OUT / "model_comparison.png")
    plt.close(fig)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    style()
    raw = (ROOT / "data" / "online_advertising_performance_data.csv").read_bytes()
    result = engine.run_all(raw, {})
    unit = "conversions"
    weekly_figure(result, unit)
    capacity_figure(result)
    shadow_figure(result, unit)
    comparison_figure(result, unit)
    print("wrote", sorted(p.name for p in OUT.glob("*.png")))
