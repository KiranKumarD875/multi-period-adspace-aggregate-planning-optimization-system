"""Excel export of the required PDF results.

Six sheets, one per result the mid-review asks for. Inputs and solver outputs are
values; every derived number (spend, conversions, totals, utilisation, gaps,
verification flags) is a live Excel formula so the workbook can be audited without
re-running Python.

  Summary           Run information, allocation headline, model comparison, checks, assumptions
  1 Allocation      Model 1 optimal X_pt for every category x week cell
  2 Weekly plan     Optimal weekly spending pattern
  3 Capacity        Capacity-bound vs under-utilised categories and cells
  4 Shadow prices   Ranked binding constraints with verified shadow prices
  5 Model 2         0/1 package selection and its objective (Model 2)
"""
from __future__ import annotations

from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

TEAL = "0F766E"
INK = "1F2933"
MUTED = "667085"
LINE = "D0D5DD"
SOFT = "F2F7F6"
WARN = "FEF0C7"

S_SUM = "Summary"
S_M1 = "1 Allocation"
S_Q2 = "2 Weekly plan"
S_Q3 = "3 Capacity"
S_Q4 = "4 Shadow prices"
S_M2 = "5 Model 2"

FMT_MONEY = '"$"#,##0.00'
FMT_NUM = "#,##0.00"
FMT_UNITS = "#,##0.0"
FMT_RATE = "0.000000"
FMT_PCT = "0.00%"
FMT_INT = "0"


def _q(sheet: str) -> str:
    return f"'{sheet}'"


def _title(ws, text, subtitle=None):
    ws["A1"] = text
    ws["A1"].font = Font(size=15, bold=True, color=INK)
    if subtitle:
        ws["A2"] = subtitle
        ws["A2"].font = Font(size=10, italic=True, color=MUTED)
    ws.sheet_view.showGridLines = False


def _header(ws, row, labels):
    for col, label in enumerate(labels, start=1):
        cell = ws.cell(row=row, column=col, value=label)
        cell.font = Font(bold=True, color="FFFFFF", size=10)
        cell.fill = PatternFill("solid", fgColor=TEAL)
        cell.alignment = Alignment(wrap_text=True, vertical="center")
    ws.row_dimensions[row].height = 30


def _widths(ws, widths):
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w


def _total_style(ws, row, ncols):
    thin = Side(style="thin", color=INK)
    for col in range(1, ncols + 1):
        cell = ws.cell(row=row, column=col)
        cell.font = Font(bold=True)
        cell.border = Border(top=thin)


def _section(ws, row, text, ncols=6):
    ws.cell(row=row, column=1, value=text).font = Font(bold=True, size=11, color=TEAL)
    for col in range(1, ncols + 1):
        ws.cell(row=row, column=col).border = Border(bottom=Side(style="thin", color=TEAL))


def build_workbook(result: dict) -> bytes:
    wb = Workbook()
    summary = wb.active
    summary.title = S_SUM
    _build_allocation(wb, result)
    _build_weekly(wb, result)
    _build_capacity(wb, result)
    _build_shadow(wb, result)
    _build_model2(wb, result)
    _build_summary(summary, result)   # built last so it can reference every sheet
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# 1 Allocation (Q1)
# ---------------------------------------------------------------------------
ALLOC_FIRST_ROW = 5


def _build_allocation(wb, result):
    ws = wb.create_sheet(S_M1)
    cells = result["model1"]["cells"]
    cfg = result["config"]
    unit = "conversions" if cfg["objective"] == "conversions" else "revenue"
    _title(ws, "Optimal allocation — Model 1 (continuous LP)",
           f"X = ad units bought in each category and week. Objective = max Σ R·X ({unit}). "
           "Spend, conversions and utilisation are formulas.")
    ws["A3"] = "Budget B ($)"
    ws["B3"] = result["inputs"]["budget"]
    ws["B3"].number_format = FMT_MONEY
    ws["C3"] = "Spend within budget?"
    ws["D3"] = (f'=IF(I{ALLOC_FIRST_ROW + len(cells)}<=B3+0.005,"Yes","No")')
    ws["A3"].font = ws["C3"].font = Font(bold=True)

    headers = ["Category", "Week", "Dates", "C = cost per unit ($)", "R = " + unit + " per unit",
               "U = capacity (units)", "L = minimum (units)", "X = units allocated",
               "Spend ($) = C·X", f"Objective = R·X ({unit})", "Utilisation = X/U", "Status"]
    _header(ws, ALLOC_FIRST_ROW - 1, headers)
    weeks = {w["week"]: w["dates"] for w in result["inputs"]["weeks"]}
    for i, c in enumerate(cells):
        r = ALLOC_FIRST_ROW + i
        ws.cell(r, 1, c["category"])
        ws.cell(r, 2, c["week"])
        ws.cell(r, 3, weeks[c["week"]])
        ws.cell(r, 4, c["C"]).number_format = FMT_RATE
        ws.cell(r, 5, c["R"]).number_format = FMT_RATE
        ws.cell(r, 6, c["U"]).number_format = FMT_UNITS
        ws.cell(r, 7, c["L"]).number_format = FMT_UNITS
        ws.cell(r, 8, c["X"]).number_format = FMT_UNITS
        ws.cell(r, 9, f"=D{r}*H{r}").number_format = FMT_MONEY
        ws.cell(r, 10, f"=E{r}*H{r}").number_format = FMT_NUM
        ws.cell(r, 11, f'=IF(F{r}>0,H{r}/F{r},0)').number_format = FMT_PCT
        ws.cell(r, 12, f'=IF(F{r}<=0,"No capacity",IF(H{r}>=F{r}-0.000001,"At capacity",IF(AND(G{r}>0,H{r}<=G{r}+0.000001),"At minimum",IF(H{r}<=0.000001,"Unused","Partly used"))))')
    last = ALLOC_FIRST_ROW + len(cells) - 1
    total = last + 1
    ws.cell(total, 1, "TOTAL")
    ws.cell(total, 8, f"=SUM(H{ALLOC_FIRST_ROW}:H{last})").number_format = FMT_UNITS
    ws.cell(total, 9, f"=SUM(I{ALLOC_FIRST_ROW}:I{last})").number_format = FMT_MONEY
    ws.cell(total, 10, f"=SUM(J{ALLOC_FIRST_ROW}:J{last})").number_format = FMT_NUM
    _total_style(ws, total, len(headers))
    ws.freeze_panes = f"B{ALLOC_FIRST_ROW}"
    ws.auto_filter.ref = f"A{ALLOC_FIRST_ROW - 1}:L{last}"
    _widths(ws, [14, 8, 18, 18, 18, 16, 16, 18, 18, 20, 16, 16])
    ws.row_dimensions[ALLOC_FIRST_ROW - 1].height = 44


# ---------------------------------------------------------------------------
# 2 Weekly plan (Q2)
# ---------------------------------------------------------------------------
WEEK_FIRST_ROW = 5


def _build_weekly(wb, result):
    ws = wb.create_sheet(S_Q2)
    q2 = result["q2"]
    weekly = q2["weekly"]
    n_alloc = len(result["model1"]["cells"])
    alloc_last = ALLOC_FIRST_ROW + n_alloc - 1
    pacing = result["config"]["pacing"]
    rule = {"none": "no binding weekly cap (B_t = B): only the total budget limits spending",
            "even": "each week capped at B / T",
            "custom": "weekly caps supplied by the user"}[pacing]
    _title(ws, "Optimal weekly spending pattern",
           f"Pattern from Model 1 with the period caps B_t in force: {rule}.")
    _header(ws, WEEK_FIRST_ROW - 1, [
        "Week", "Dates", "Spend ($)", "Objective (conversions or revenue)",
        "Cumulative spend ($)", "Share of budget", "Weekly cap B_t ($)",
        "Within cap? (Spend ≤ Cap)"])
    ws.cell(3, 1, "Budget B ($)").font = Font(bold=True)
    ws.cell(3, 2, f"={_q(S_M1)}!$B$3").number_format = FMT_MONEY
    for i, row in enumerate(weekly):
        r = WEEK_FIRST_ROW + i
        ws.cell(r, 1, row["week"])
        ws.cell(r, 2, row["dates"])
        ws.cell(r, 3, f"=SUMIF({_q(S_M1)}!$B${ALLOC_FIRST_ROW}:$B${alloc_last},A{r},"
                      f"{_q(S_M1)}!$I${ALLOC_FIRST_ROW}:$I${alloc_last})").number_format = FMT_MONEY
        ws.cell(r, 4, f"=SUMIF({_q(S_M1)}!$B${ALLOC_FIRST_ROW}:$B${alloc_last},A{r},"
                      f"{_q(S_M1)}!$J${ALLOC_FIRST_ROW}:$J${alloc_last})").number_format = FMT_NUM
        ws.cell(r, 5, f"=SUM($C${WEEK_FIRST_ROW}:C{r})").number_format = FMT_MONEY
        ws.cell(r, 6, f"=C{r}/$B$3").number_format = FMT_PCT
        cap = row.get("cap")
        if cap is not None:
            if pacing == "even":
                ws.cell(r, 7, f"=$B$3/{len(weekly)}").number_format = FMT_MONEY
            else:
                ws.cell(r, 7, cap).number_format = FMT_MONEY
            ws.cell(r, 8, f'=IF(C{r}<=G{r}+0.005,"Yes","VIOLATION")')
        else:
            ws.cell(r, 7, "none (non-binding)")
            ws.cell(r, 8, "Yes (no cap)")
    last = WEEK_FIRST_ROW + len(weekly) - 1
    total = last + 1
    ws.cell(total, 1, "TOTAL SPENT")
    ws.cell(total, 3, f"=SUM(C{WEEK_FIRST_ROW}:C{last})").number_format = FMT_MONEY
    ws.cell(total, 4, f"=SUM(D{WEEK_FIRST_ROW}:D{last})").number_format = FMT_NUM
    ws.cell(total, 6, f"=SUM(F{WEEK_FIRST_ROW}:F{last})").number_format = FMT_PCT
    ws.cell(total, 8, f'=IF(COUNTIF(H{WEEK_FIRST_ROW}:H{last},"VIOLATION")=0,"Yes (all within cap)","VIOLATIONS")')
    _total_style(ws, total, 8)

    unspent_row = total + 1
    ws.cell(unspent_row, 1, "UNSPENT BUDGET")
    ws.cell(unspent_row, 3, f"=$B$3-C{total}").number_format = FMT_MONEY
    ws.cell(unspent_row, 6, f"=C{unspent_row}/$B$3").number_format = FMT_PCT
    ws.cell(unspent_row, 7, "Unspent funds (carry-over analogue)")
    _total_style(ws, unspent_row, 8)

    comp = q2.get("reference")
    r = unspent_row + 2
    _section(ws, r, "Reference: the same budget under the other pacing rule", 8)
    r += 1
    if comp:
        ws.cell(r, 1, comp["rule"])
        r += 1
        ref_obj_row = r
        ws.cell(r, 1, "Objective under this rule")
        ws.cell(r, 3, comp["objective"]).number_format = FMT_NUM
        r += 1
        loss_row = r
        ws.cell(r, 1, "Objective given up relative to the plan above")
        # Dynamic live formula
        if comp["objective"] >= (result["model1"]["objective"] or 0):
            ws.cell(r, 3, f"=C{ref_obj_row}-D{total}").number_format = FMT_NUM
            r += 1
            ws.cell(r, 1, "Share of objective given up (%)")
            ws.cell(r, 3, f"=C{loss_row}/C{ref_obj_row}").number_format = FMT_PCT
        else:
            ws.cell(r, 3, f"=D{total}-C{ref_obj_row}").number_format = FMT_NUM
            r += 1
            ws.cell(r, 1, "Share of objective given up (%)")
            ws.cell(r, 3, f"=C{loss_row}/D{total}").number_format = FMT_PCT
        r += 1
        _header(ws, r, ["Week", "Spend under this rule ($)"])
        for i, s in enumerate(comp["weekly_spend"]):
            ws.cell(r + 1 + i, 1, i + 1)
            ws.cell(r + 1 + i, 2, s).number_format = FMT_MONEY
    else:
        ws.cell(r, 1, "Reference not available: the alternative rule is infeasible for this data.")
    _widths(ws, [16, 22, 18, 26, 22, 16, 22, 24])
    ws.row_dimensions[WEEK_FIRST_ROW - 1].height = 44


# ---------------------------------------------------------------------------
# 3 Capacity (Q3)
# ---------------------------------------------------------------------------
def _build_capacity(wb, result):
    ws = wb.create_sheet(S_Q3)
    cats = result["q3"]["categories"]
    n_alloc = len(result["model1"]["cells"])
    alloc_last = ALLOC_FIRST_ROW + n_alloc - 1
    _title(ws, "Capacity-bound vs under-utilised",
           "Capacity-bound: utilisation ≥ 99%. Under-utilised: below 99%. Unused: below 1%.")
    _header(ws, 4, ["Category", "Units allocated X", "Capacity U", "Utilisation",
                    "Status", "Spend ($)", "Objective"])
    for i, cat in enumerate(cats):
        r = 5 + i
        ws.cell(r, 1, cat["category"])
        ws.cell(r, 2, f"=SUMIF({_q(S_M1)}!$A${ALLOC_FIRST_ROW}:$A${alloc_last},A{r},"
                      f"{_q(S_M1)}!$H${ALLOC_FIRST_ROW}:$H${alloc_last})").number_format = FMT_UNITS
        ws.cell(r, 3, f"=SUMIF({_q(S_M1)}!$A${ALLOC_FIRST_ROW}:$A${alloc_last},A{r},"
                      f"{_q(S_M1)}!$F${ALLOC_FIRST_ROW}:$F${alloc_last})").number_format = FMT_UNITS
        ws.cell(r, 4, f"=IF(C{r}>0,B{r}/C{r},0)").number_format = FMT_PCT
        ws.cell(r, 5, f'=IF(ROUND(D{r},3)>=0.99,"Capacity-bound",IF(D{r}<0.01,"Unused","Under-utilised"))')
        ws.cell(r, 6, f"=SUMIF({_q(S_M1)}!$A${ALLOC_FIRST_ROW}:$A${alloc_last},A{r},"
                      f"{_q(S_M1)}!$I${ALLOC_FIRST_ROW}:$I${alloc_last})").number_format = FMT_MONEY
        ws.cell(r, 7, f"=SUMIF({_q(S_M1)}!$A${ALLOC_FIRST_ROW}:$A${alloc_last},A{r},"
                      f"{_q(S_M1)}!$J${ALLOC_FIRST_ROW}:$J${alloc_last})").number_format = FMT_NUM
    last = 4 + len(cats)
    r = last + 2
    _section(ws, r, "Cell status counts (category × week cells)", 7)
    r += 1
    _header(ws, r, ["Cell status", "Count", "Meaning"])
    meanings = {
        "At capacity": "X = U: the capacity limit is binding",
        "At minimum": "X = L: the minimum commitment is binding",
        "Partly used": "Between the minimum and the capacity",
        "Unused": "X = 0",
        "No capacity": "U = 0: the cell has no historical displays",
    }
    for i, (label, text) in enumerate(meanings.items()):
        rr = r + 1 + i
        ws.cell(rr, 1, label)
        ws.cell(rr, 2, f'=COUNTIF({_q(S_M1)}!$L${ALLOC_FIRST_ROW}:$L${alloc_last},A{rr})')
        ws.cell(rr, 3, text)
    _widths(ws, [22, 18, 16, 14, 18, 18, 16])


# ---------------------------------------------------------------------------
# 4 Shadow prices (Q4)
# ---------------------------------------------------------------------------
SHADOW_FIRST_ROW = 6


def _build_shadow(wb, result):
    ws = wb.create_sheet(S_Q4)
    q4 = result["q4"]
    obj = "conversions" if result["config"]["objective"] == "conversions" else "revenue"
    _title(ws, "Binding constraints and their shadow prices",
           "Dual value = change in the objective for one extra unit of the limit (PuLP/CBC LP duals). "
           "Each value is checked by re-solving with the limit moved one step down and one step up.")
    ws.cell(3, 1, "Highest shadow price:").font = Font(bold=True)
    ws.cell(3, 2, q4["headline"])
    headers = ["Rank", "Binding constraint", "Type", "Limit (right-hand side)", "Unit",
               f"Dual value = shadow price ({obj} per +1 unit)",
               "Re-solve slope, one step down", "Re-solve slope, one step up",
               "Verified?", "Reading"]
    _header(ws, SHADOW_FIRST_ROW - 1, headers)
    first = SHADOW_FIRST_ROW
    for i, row in enumerate(q4["rows"]):
        r = first + i
        unit_word = "dollar" if row["unit"] == "$" else "ad unit"
        ws.cell(r, 1, i + 1)
        ws.cell(r, 2, row["label"])
        ws.cell(r, 3, row["kind"])
        ws.cell(r, 4, row["rhs"]).number_format = FMT_NUM
        ws.cell(r, 5, row["unit"])
        ws.cell(r, 6, row["shadow_price"]).number_format = "0.000000"
        left = row.get("finite_difference_left")
        right = row.get("finite_difference_right")
        ws.cell(r, 7, left if left is not None else "n/a").number_format = "0.000000"
        ws.cell(r, 8, right if right is not None else "n/a").number_format = "0.000000"
        ws.cell(r, 9, f'=IF(AND(ISNUMBER(G{r}),ISNUMBER(H{r})),IF(AND(F{r}>=MIN(G{r},H{r})-0.001*ABS(F{r})-0.000000001,'
                      f'F{r}<=MAX(G{r},H{r})+0.001*ABS(F{r})+0.000000001),"Yes","No"),"No")')
        ws.cell(r, 10, f"One extra {unit_word} adds {row['shadow_price']:.6f} {obj} to the plan.")
    last = first + len(q4["rows"]) - 1
    if q4["rows"]:
        ws.cell(last + 2, 1, "Rows verified:").font = Font(bold=True)
        ws.cell(last + 2, 3, f'=COUNTIF(I{first}:I{last},"Yes")&" of "&COUNTA(I{first}:I{last})')
    note_row = last + 4
    ws.cell(note_row, 1, q4["note"]).font = Font(italic=True, color=MUTED, size=9)
    for i, ex in enumerate(q4.get("excluded", [])):
        ws.cell(note_row + 1 + i, 1,
                f"Not ranked: {ex['label']}. {ex['reason']}").font = Font(italic=True, color=MUTED, size=9)
    ws.freeze_panes = f"C{first}"
    _widths(ws, [8, 46, 16, 20, 10, 26, 22, 22, 12, 60])
    ws.row_dimensions[SHADOW_FIRST_ROW - 1].height = 44


# ---------------------------------------------------------------------------
# 5 Model 2 (0/1 packages)
# ---------------------------------------------------------------------------
def _build_model2(wb, result):
    ws = wb.create_sheet(S_M2)
    m2 = result["model2"]
    packages = m2["packages"]
    obj = "conversions" if result["config"]["objective"] == "conversions" else "revenue"
    _title(ws, "Model 2 · Discrete package selection (0/1 integer program)",
           f"y = 1 buys the package, 0 skips it. Objective = max Σ value·y ({obj}), "
           "subject to the budget, the category-week spend caps and the capacity and minimum limits.")
    ws["A3"] = "Status"
    ws["B3"] = m2["status"]
    ws["C3"] = "Packages selected"
    headers = ["Package", "Category", "Week", "Size (fraction of U)", "Units", "Cost ($)",
               "Value (" + obj + ")", "Selected y (1 / 0)", "Spend if selected ($)", "Value if selected"]
    first = 6
    _header(ws, first - 1, headers)
    for i, p in enumerate(packages):
        r = first + i
        ws.cell(r, 1, p["id"])
        ws.cell(r, 2, p["category"])
        ws.cell(r, 3, p["week"])
        ws.cell(r, 4, p["fraction"]).number_format = "0%"
        ws.cell(r, 5, p["units"]).number_format = FMT_UNITS
        ws.cell(r, 6, p["cost"]).number_format = FMT_MONEY
        ws.cell(r, 7, p["value"]).number_format = FMT_NUM
        ws.cell(r, 8, 1 if p.get("selected") else 0)
        ws.cell(r, 9, f"=F{r}*H{r}").number_format = FMT_MONEY
        ws.cell(r, 10, f"=G{r}*H{r}").number_format = FMT_NUM
    last = first + len(packages) - 1
    total = last + 1
    ws.cell(total, 1, "TOTAL")
    ws.cell(total, 8, f"=SUM(H{first}:H{last})")
    ws.cell(total, 9, f"=SUM(I{first}:I{last})").number_format = FMT_MONEY
    ws.cell(total, 10, f"=SUM(J{first}:J{last})").number_format = FMT_NUM
    _total_style(ws, total, len(headers))
    n_alloc = len(result["model1"]["cells"])
    alloc_total = ALLOC_FIRST_ROW + n_alloc
    n_weeks = len(result["q2"]["weekly"]) if result.get("q2") else 13
    week_last = WEEK_FIRST_ROW + n_weeks - 1

    ws["A3"] = "Status"
    ws["B3"] = m2["status"]
    ws["C3"] = "Packages selected"
    ws["D3"] = f"=H{total}"
    ws["E3"] = "Spend within budget?"
    ws["F3"] = f'=IF(D4<={_q(S_M1)}!B3+0.005,"Yes","No")'
    ws["G3"] = "Bound holds (IP ≤ LP)?"
    ws["H3"] = f'=IF(B4<={_q(S_M1)}!J{alloc_total}+0.005,"Yes","No")'

    ws["A4"] = "Model 2 objective"
    ws["B4"] = f"=J{total}"
    ws["B4"].number_format = FMT_NUM
    ws["C4"] = "Model 2 spend ($)"
    ws["D4"] = f"=I{total}"
    ws["D4"].number_format = FMT_MONEY
    ws["E4"] = "Weekly caps respected?"
    ws["F4"] = f'=IF(COUNTIF({_q(S_Q2)}!H{WEEK_FIRST_ROW}:H{week_last},"VIOLATION")=0,"Yes","No")'
    ws["G4"] = "Solver proven optimal?"
    ws["H4"] = "Yes" if m2.get("optimal") else "No"

    for c in ("A3", "C3", "E3", "G3", "A4", "C4", "E4", "G4"):
        ws[c].font = Font(bold=True)
    ws.freeze_panes = f"B{first}"
    ws.auto_filter.ref = f"A{first - 1}:J{last}"
    _widths(ws, [14, 14, 8, 16, 20, 16, 20, 18, 20, 18])
    ws.row_dimensions[first - 1].height = 44


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
def _build_summary(ws, result):
    cfg = result["config"]
    ds = result["dataset"]
    obj = "conversions" if cfg["objective"] == "conversions" else "revenue"
    m1 = result["model1"]
    m2 = result["model2"]
    comp = result["comparison"]
    n_alloc = len(m1["cells"])
    alloc_total = ALLOC_FIRST_ROW + n_alloc
    alloc_last = alloc_total - 1
    T = ds["weeks"]
    P = len(result["inputs"]["categories"])
    _title(ws, "Ad-space aggregate planning — results",
           "Multi-period LP (Model 1) and 0/1 package IP (Model 2) continuous and discrete optimization.")

    r = 4
    _section(ws, r, "Run information", 4); r += 1
    pacing_text = {"none": "None: B_t = B, so the weekly caps never bind",
                   "even": "Even: B_t = B / T",
                   "custom": "Custom weekly caps"}[cfg["pacing"]]
    info = [
        ("Solver", result["solver"]),
        ("Dataset file", ds["filename"]),
        ("Rows in file", ds["rows"]),
        ("Rows used", ds["usable_rows"]),
        ("Rows excluded (no category or date)", ds["excluded"]["rows"]),
        ("Date range", ds["date_range"]),
        ("Weeks (T)", T),
        ("Planning categories (P)", P),
        ("Explicit constraints (1 + T + 2PT)", m1.get("explicit_constraints")),
        ("Planning category", cfg["category"]),
        ("Objective", obj),
        ("Budget share of historical cost", cfg["budget_fraction"]),
        ("Capacity factor (U = factor × historical displays)", cfg["capacity_factor"]),
        ("Minimum commitment (fraction of U)", cfg["minimum_fraction"]),
        ("Weekly caps B_t", pacing_text),
        ("Total historical ad spend ($)", ds["totals"]["cost"]),
        ("Budget specification & baseline", ds.get("historical_spend_validation", {}).get("summary", "Budget specified against historical spend")),
    ]
    for label, value in info:
        ws.cell(r, 1, label)
        ws.cell(r, 2, value)
        if label == "Budget share of historical cost":
            ws.cell(r, 2).number_format = "0%"
        elif label.startswith("Capacity factor"):
            ws.cell(r, 2).number_format = "0.00"
        elif label.startswith("Minimum commitment"):
            ws.cell(r, 2).number_format = "0%"
        elif label.startswith("Total historical ad spend"):
            ws.cell(r, 2).number_format = FMT_MONEY
        r += 1

    r += 1
    _section(ws, r, "Best allocation (Model 1)", 4); r += 1
    ws.cell(r, 1, f"Maximum expected {obj} (Model 1)")
    ws.cell(r, 2, f"={_q(S_M1)}!J{alloc_total}").number_format = FMT_NUM
    obj_row = r
    r += 1
    ws.cell(r, 1, "Total spend ($)")
    ws.cell(r, 2, f"={_q(S_M1)}!I{alloc_total}").number_format = FMT_MONEY
    spend_row = r
    r += 1
    ws.cell(r, 1, "Budget B ($)")
    ws.cell(r, 2, f"={_q(S_M1)}!$B$3").number_format = FMT_MONEY
    budget_row = r
    r += 1
    base_rule = result["baseline"].get("rule", "Proportional split")
    ws.cell(r, 1, f"Baseline heuristic ({base_rule}) ({obj})")
    ws.cell(r, 2, result["baseline"]["objective"]).number_format = FMT_NUM
    base_row = r
    r += 1
    ws.cell(r, 1, "Uplift over baseline (%)")
    ws.cell(r, 2, f"=B{obj_row}/B{base_row}-1").number_format = FMT_PCT
    r += 1
    ws.cell(r, 1, "Model 1 status")
    ws.cell(r, 2, m1["status"])

    r += 2
    _section(ws, r, "Weekly pattern", 4); r += 1
    weeks_n = len(result["q2"]["weekly"]) if result.get("q2") else T
    ws.cell(r, 1, "Peak week spend ($)")
    ws.cell(r, 2, f"=MAX({_q(S_Q2)}!C{WEEK_FIRST_ROW}:C{WEEK_FIRST_ROW + weeks_n - 1})").number_format = FMT_MONEY
    r += 1
    ws.cell(r, 1, "Unspent budget ($)")
    ws.cell(r, 2, f"=B{budget_row}-B{spend_row}").number_format = FMT_MONEY
    unspent_row = r
    r += 1
    ws.cell(r, 1, "Unspent share of budget (%)")
    ws.cell(r, 2, f"=B{unspent_row}/B{budget_row}").number_format = FMT_PCT
    r += 1
    ws.cell(r, 1, "See sheet '2 Weekly plan' for every week.").font = Font(italic=True, color=MUTED)

    r += 2
    _section(ws, r, "Capacity status (categories)", 4); r += 1
    for cat in result["q3"]["categories"]:
        ws.cell(r, 1, cat["category"])
        ws.cell(r, 2, cat["label"])
        ws.cell(r, 3, cat["utilisation_pct"] / 100).number_format = FMT_PCT
        r += 1

    r += 1
    _section(ws, r, "Highest shadow price & sensitivity", 4); r += 1
    top = result["q4"]["rows"][0] if result["q4"]["rows"] else None
    ws.cell(r, 1, "Binding constraint")
    ws.cell(r, 2, top["label"] if top else "None")
    r += 1
    ws.cell(r, 1, f"Shadow price ({obj} per +1 unit)")
    ws.cell(r, 2, f"={_q(S_Q4)}!F{SHADOW_FIRST_ROW}" if top else None).number_format = "0.000000"
    r += 1
    ws.cell(r, 1, "Verified by re-solve?")
    ws.cell(r, 2, f"={_q(S_Q4)}!I{SHADOW_FIRST_ROW}" if top else None)
    r += 1
    ws.cell(r, 1, "Dual slope stability")
    ws.cell(r, 2, result["q4"].get("robustness", {}).get("status", "Verified"))

    r += 2
    _section(ws, r, "Model comparison", 4); r += 1
    ws.cell(r, 1, "Proportional split"); ws.cell(r, 2, comp["baseline"]).number_format = FMT_NUM
    r += 1
    ws.cell(r, 1, "Model 1 · LP (continuous)")
    ws.cell(r, 2, f"={_q(S_M1)}!J{alloc_total}").number_format = FMT_NUM
    lp_row = r
    r += 1
    ws.cell(r, 1, "Model 2 · IP (0/1 packages)")
    ws.cell(r, 2, f"={_q(S_M2)}!B4").number_format = FMT_NUM
    ip_row = r
    r += 1
    ws.cell(r, 1, "Model 2 status"); ws.cell(r, 2, m2["status"]); r += 1
    ws.cell(r, 1, "Integrality gap (LP − IP) / LP (%)")
    ws.cell(r, 2, f"=(B{lp_row}-B{ip_row})/B{lp_row}").number_format = FMT_PCT
    r += 1
    ws.cell(r, 1, "IP upper bound from its LP relaxation")
    ws.cell(r, 2, m2.get("relaxation_bound")).number_format = FMT_NUM
    bound_row = r
    r += 1
    ws.cell(r, 1, "Gap to that bound (%): certifies the IP optimum")
    ws.cell(r, 2, f"=(B{bound_row}-B{ip_row})/B{bound_row}").number_format = FMT_PCT
    r += 1
    ws.cell(r, 1, "Bound holds (IP ≤ LP)?")
    ws.cell(r, 2, f'=IF(B{ip_row}<=B{lp_row}+0.000001,"Yes","No")')
    r += 1
    ws.cell(r, 1, "Packages selected (of available)")
    ws.cell(r, 2, f"={_q(S_M2)}!D3 & \" of \" & {len(m2['packages'])}")

    r += 2
    _section(ws, r, "Model checks", 4); r += 1
    ws.cell(r, 1, "Constraints re-verified from the solution")
    ws.cell(r, 2, f"{result['checks']['passed']} of {result['checks']['total']} passed")
    r += 1
    ws.cell(r, 1, "Live check: allocations outside [L, U] (should be 0)")
    ws.cell(r, 2, f"=SUMPRODUCT(--({_q(S_M1)}!H{ALLOC_FIRST_ROW}:H{alloc_last}<{_q(S_M1)}!G{ALLOC_FIRST_ROW}:G{alloc_last}-0.000001))"
                  f"+SUMPRODUCT(--({_q(S_M1)}!H{ALLOC_FIRST_ROW}:H{alloc_last}>{_q(S_M1)}!F{ALLOC_FIRST_ROW}:F{alloc_last}+0.000001))")
    r += 1
    ws.cell(r, 1, "Live check: spend within budget?")
    ws.cell(r, 2, f'=IF({_q(S_M1)}!I{alloc_total}<=B{budget_row}+0.005,"Yes","No")')
    r += 1

    r += 1
    _section(ws, r, "Excel Solver cross-check", 4); r += 1
    steps = [
        f"Set objective: '{S_M1}'!J{alloc_total} (Max).",
        f"By changing: '{S_M1}'!H{ALLOC_FIRST_ROW}:H{alloc_last} (the X column).",
        f"Subject to: H ≥ G and H ≤ F for every row; '{S_M1}'!I{alloc_total} ≤ B.",
        "Solver should return the same objective as the first row of the Best allocation block (LP, Simplex).",
    ]
    if cfg["pacing"] != "none":
        steps.append(f"Also: weekly spend in '{S_Q2}' column C ≤ its cap in column G, for each week.")
    for step in steps:
        ws.cell(r, 1, "• " + step)
        r += 1

    r += 1
    _section(ws, r, "Assumptions and limitations", 4); r += 1
    notes = [
        "Rates C, R are historical averages per display; U is historical displays × capacity factor.",
        "Expected conversions are deterministic and linear in units (constant returns).",
        "Displays are a proxy for ad units, not measured video slots.",
        "B, U and L are planning inputs; B_t is a planning input (default: non-binding).",
        "Model 2 packages are synthetic size blocks of each cell's capacity, not supplier catalogue items.",
        "The dataset has no year; weeks are counted from the first observed date.",
    ]
    for note in notes:
        ws.cell(r, 1, "• " + note)
        r += 1

    _widths(ws, [52, 30, 22, 16])
    ws.column_dimensions["B"].width = 60
