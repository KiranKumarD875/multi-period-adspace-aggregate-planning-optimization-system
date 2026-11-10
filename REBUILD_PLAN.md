# Rebuild Plan — Multi-Period Aggregate Planning for Streaming Ad-Space Allocation

Source specification: `data/or_project_mid_review.pdf` (Joel John, Hemesh Yeturu, Ssudier, Kiran; Amrita Vishwa Vidyapeetham).

Status of this document: the rebuilt code exists in this folder and passes its tests. Section 13 states exactly what was verified and what was not.

---

## 1. Goal and scope

Replace the current prototype with a project that:

1. Implements **exactly** the two models in the mid-review (Model 1 LP, Model 2 0/1 IP) and nothing the PDF does not ask for.
2. Answers the **four required questions** (Q1–Q4) with verified numbers.
3. Shows the **working** of the project in the web interface: data → parameters → models → answers → checks.
4. Exports **one Excel workbook** that contains only the required results, with live formulas so each derived number can be checked.

Out of scope (deliberately removed from the product): carry-over extension, piecewise ad-fatigue model, budget-validation sheet, Excel Solver instructions sheet, sensitivity-curve sheet, landing marketing page. Section 9 explains why.

---

## 2. Traceability: PDF requirement → deliverable

| PDF item (slide) | Requirement | Where it is delivered |
|---|---|---|
| Problem statement (3) | Allocate fixed budget across categories and periods to maximise conversions | Model 1 in `engine.py`; Overview page |
| Dataset (4), derivation (5) | Aggregate observations; derive C, R; estimate U, L; validate B | `build_dataset()`; Data page (worked example, cell table) |
| Core questions (6) | Q1 allocation, Q2 weekly pattern, Q3 capacity status, Q4 shadow prices | `answer_q1..q4()`; Results tabs; workbook sheets 1–4 |
| Model 1 indices, variables, parameters (10–11) | p, t, X_pt, C, R, B, B_t, U, L | `_lp_rows()`; Setup page; Export page formulas |
| Objective and constraints (12–13) | Max Σ R X; budget; period cap; capacity; minimum; nonnegativity; count 1+T+2PT | `_solve_lp()`; checks; explicit-constraint count shown |
| Model 2 (14–15) | y ∈ {0,1}; knapsack; category-period cap W_pt | `solve_model2()`; Model 2 tab; workbook sheet 5 |
| Model comparison (17) | Model 2 objective ≤ Model 1 objective under equivalent constraints | `comparison()`; bound check on Overview; Summary sheet |
| Assumptions and limitations (16) | Linear returns; deterministic rates; capacity proxy; impressions as units; continuous vs discrete | Method page; Summary sheet notes; Export page |
| Tools (8) | Python, Pandas/NumPy, Matplotlib/Seaborn, PuLP with CBC for LP and IP, Excel Solver for cross-checking, LP dual values | PuLP/CBC in `backend/solvers.py`; figures in `scripts/`; workbook cross-check block; see §16 |
| Conclusion (19) | Sensitivity analysis for binding constraints and marginal values | Q4 with finite-difference verification |

---

## 3. Architecture

```
adspace-rebuild/
├── backend/
│   ├── engine.py        data → cells → Model 1 / Model 2 → Q1–Q4 → checks   (≈650 lines)
│   ├── solvers.py       PuLP + CBC (production) and HiGHS (reference only)  (≈180 lines)
│   ├── workbook.py      six-sheet Excel export with formulas                  (≈500 lines)
│   ├── api.py           FastAPI: health, sample, inspect, runs, export       (≈130 lines)
│   └── requirements.txt
├── frontend/            React 18 + Vite 5 + Recharts 2 + lucide icons
│   └── src/
│       ├── App.jsx                   shell, navigation, run state, offline fallback
│       ├── pages/                    Overview · DataPage · Setup · Results · Export
│       ├── components/ui.jsx         cards, stats, badges, tables, segmented, tooltips
│       ├── components/charts.jsx     weekly, comparison, shadow-price, utilisation
│       ├── lib/                      api client, number formats, default config
│       └── data/sample-result.json   bundled result for the offline demo
├── tests/test_engine.py     21 acceptance tests (run with or without pytest)
├── tests/test_crosscheck.py PuLP/CBC against the HiGHS reference, four configurations
├── scripts/              build_fixture.py, build_workbook_demo.py, make_figures.py
├── docs/                 this plan and docs/figures/ (Matplotlib and Seaborn figures)
└── data/                 bundled CSV and the mid-review PDF
```

**Data flow**

```
CSV ──► build_dataset ──► cells (C, R, U, L, W) + weeks + budget B
                         │
          ┌──────────────┴──────────────┐
     solve_model1 (LP)            solve_model2 (0/1 IP)
          │                             │
   answer_q1..q4 (+ checks)      packages, selection
          └──────────────┬──────────────┘
                 run_all → one JSON document
                 ├── web UI (every page reads this document)
                 └── build_workbook → adspace-results.xlsx
```

Design rules:

- **One source of truth.** Every number shown in the UI and written to Excel comes from the JSON document. No narrative number is typed by hand.
- **Stateless API.** Each request carries its configuration and, optionally, the CSV. The Excel export re-runs the analysis, so a download always matches the screen.
- **Honest status.** A result is labelled "proven optimal" only when the solver closes the gap; otherwise "feasible, not proven"; otherwise "infeasible" with the reason.

---

## 4. Engine specification

### 4.1 Data preparation (PDF slides 4–5) — Pandas and NumPy

| Step | Rule |
|---|---|
| Read | UTF-8 CSV with header. Unnamed and fully empty columns are dropped. |
| Map columns | Auto-detected by alias (`month`, `day`, `placement` / `campaign_number`, `displays`, `cost`, `post_click_conversions`, `revenue`, `clicks`). Overridable through `config.mapping`. |
| Category | Chosen by `config.category` (placement or campaign). Only that column groups the rows. |
| Dates | Month name or number plus day, placed in an internal anchor year that is never displayed. Weeks are counted from the first observed date. |
| Exclusions | Rows with no category or an invalid date are excluded and counted, with their share of cost and conversions reported. |
| Bad values | A blank, non-numeric or negative value in a usable row **stops the run** and names the count. Nothing is imputed. |
| Aggregation | Sums of cost, displays, conversions and revenue per (category, week). Missing cells are zero. |
| Rates | C = cost ÷ displays; R = conversions (or revenue) ÷ displays. Zero-display cells get C = R = 0 and U = 0. |
| Bounds | U = capacity factor × displays; L = minimum fraction × U; W = cell spend cap (default C × U). |
| Budget | B = total budget if given, else budget share × Σ C·U (full historical capacity cost). |
| Limits | At most 500 cells; at most 200,000 rows. |

### 4.2 Weekly caps B_t (PDF slide 11)

Model 1 always carries the period caps, as the PDF's formulation does. The value is a planning input:

- `none` (default): B_t = B for every week. The rows are present but never bind, so Q2 is the free-timing optimum and the budget shadow price is unique.
- `even`: B_t = B ÷ T. The caps sum to B, so the total-budget row is implied by them; the Q4 table then reports the period-cap prices and states that the budget row is implied.
- `custom` (API): one nonnegative value per week.

### 4.3 Model 1 — LP, solved with PuLP and CBC (PDF slides 8, 10–13)

Maximise Σ_pt R_pt X_pt subject to:

- Σ_pt C_pt X_pt ≤ B (budget)
- Σ_p C_pt X_pt ≤ B_t for each week t (period cap)
- X_pt ≤ U_pt and X_pt ≥ L_pt for each cell (explicit rows, so each has a dual)
- X ≥ 0 (variable bounds)

Explicit constraints = **1 + T + 2PT** for every pacing rule. For P = 5, T = 13: **144**, plus 65 nonnegativity bounds.

Implementation: `backend/solvers.py`, class `PuLPCBC`. The problem is built with `pulp.LpProblem`, `pulp.LpVariable` and `pulp.lpSum`; each constraint is added with `addConstraint(expr, id)`; the problem is solved with `pulp.PULP_CBC_CMD(msg=False, timeLimit=60, threads=1)`.

### 4.4 Model 2 — 0/1 IP, solved with PuLP and CBC (PDF slides 14–15)

Packages: for each cell with capacity, one package per size f in `package_sizes`, with units = f·U, cost = C·units, value = R·units.

Maximise Σ value_j y_j subject to:

- Σ cost_j y_j ≤ B (knapsack)
- Σ_{j∈(p,t)} cost_j y_j ≤ W_pt (category-week cap, a dollar amount distinct from U)
- Σ_{j∈(p,t)} units_j y_j ≤ U_pt and ≥ L_pt (same as Model 1, so the slide 17 bound applies)
- Σ_p cost_j y_j ≤ B_t for each week (same as Model 1)
- y_j ∈ {0, 1} as `LpVariable(cat="Binary")`

**Optimality certificate.** The integer result is accepted as "proven" only when CBC reports optimal. Independently, the same rows are solved with 0 ≤ y ≤ 1 to give an upper bound; the reported gap to that bound is the certificate, so the claim does not rest on CBC's stopping rule alone.

### 4.5 Q1–Q4 and checks

| Question | Algorithm | Output |
|---|---|---|
| Q1 | Model 1 objective and spend. Proportional baseline X = f·U with f = min(1, B ÷ full cost). Uplift = LP ÷ baseline − 1. | objective, spend, budget, baseline, uplift % |
| Q2 | Weekly spend and objective from Model 1. A reference solve under the other pacing rule (even, or free timing) gives the objective given up. | weekly rows, cumulative spend, caps, reference |
| Q3 | Cell status: At capacity (X = U), At minimum (X = L > 0), Unused (X = 0), Partly used. Category: utilisation ≥ 99% → capacity-bound; below 99% → under-utilised. | cell counts, category table |
| Q4 | Dual values of every binding row, from CBC (PDF slide 19 sensitivity). Shadow price = change in objective per +1 unit of the limit. Sign follows the row sense in a maximisation: ≤ rows ≥ 0, ≥ rows ≤ 0. Each price is re-checked by re-solving one step down and one step up; a price is verified when it lies between the two one-sided slopes (the value function is piecewise linear, so at a kink the dual equals one of the slopes). | ranked rows, headline, slopes, verification flag, implied rows |
| Checks | Every explicit row re-evaluated from the solution with tolerance 1e-6 + 1e-7·scale; nonnegativity checked. | passed / total |

### 4.6 Errors and statuses

| Situation | Behaviour |
|---|---|
| Bad CSV, missing column, bad value | HTTP 422 with a plain-language message naming the column or row count |
| No feasible LP plan | Status "Infeasible" and a message naming the input to relax. Q1–Q4 are null. |
| IP hits the time limit | Status "Feasible (time limit, not proven)" |
| PuLP or CBC not installed | HTTP 503 naming the missing component |
| Invalid configuration | HTTP 422 naming the field |
| Upload over 15 MB | HTTP 413 |

## 5. API contract

| Method and path | Purpose | Input | Output |
|---|---|---|---|
| GET `/api/health` | Liveness and solver version | — | `{status, solver, sample_available}` |
| GET `/api/sample` | Bundled dataset metadata | — | filename, columns, rows, mapping, default config |
| GET `/api/sample.csv` | Download the sample | — | CSV |
| GET `/api/specification` | The mid-review PDF | — | PDF |
| POST `/api/inspect` | Check an upload before running | multipart `file` | columns, rows, mapping |
| POST `/api/runs` | Run both models and Q1–Q4 | form `config` (JSON string), optional `file` | full result document (§5.1) |
| POST `/api/export` | Same run as an Excel workbook | form `config`, optional `file` | `.xlsx` attachment |

### 5.1 Result document (abridged)

```
id, created_at, config, dataset{filename, sha256, rows, usable_rows, excluded, date_range, weeks, totals, mapping}
inputs{budget, full_capacity_cost, categories, weeks[], cells[]}
model1{status, objective, spend, variables, explicit_constraints, seconds, cells[], rows[]}
model2{status, objective, spend, selected_count, variables, constraints, packages[]}
baseline{objective, spend, fraction, feasible}
q1{objective, spend, budget, baseline_objective, uplift_pct}
q2{weekly[], pacing_applied, even_pacing_comparison}
q3{cells{at_capacity, at_minimum, partial, zero, no_capacity}, categories[]}
q4{rows[{id, kind, label, rhs, unit, shadow_price, finite_difference, verified}], headline, note}
comparison{baseline, lp, ip, gap_pct, bound_holds}
checks{passed, total, all_passed, failed[]}
```

---

## 6. Solver decision (PDF slide 8)

**Production solver: PuLP with the CBC solver**, as the mid-review specifies. Pinned to `pulp==2.8.0`, the version your original project used.

**Reference solver: SciPy HiGHS**, kept only for cross-checking. It is used by `tests/test_crosscheck.py` and whenever `ADSPACE_SOLVER=highs` is set. It is not required to run the application.

Both backends implement the same interface (`backend/solvers.py`), so the engine code is identical for both. The selection is one environment variable, and the default is PuLP + CBC.

What the cross-check checks: the LP objective, the constraint count, the IP objective and its optimality, the residual checks, and that every Q4 price is verified, for four configurations (default, even pacing, revenue/campaign, minimum commitment 20%). The test fails if the two solvers disagree beyond 1e-6 relative.

## 7. Excel workbook specification

Six sheets. Every derived number is a formula. Inputs and solver outputs are values.

| Sheet | Answers | Contents | Live formulas |
|---|---|---|---|
| **Summary** | Overview, Q1 headline, comparison | Run information (solver named); Q1 objective and spend (linked); uplift; Q2 peak; Q3 category labels; Q4 top price and verification; model comparison with relaxation bound and gap; live checks; Excel Solver cross-check steps; assumptions | Links to other sheets; uplift; integrality gap; gap to relaxation bound; live violation counts; budget check |
| **1 Allocation** | Q1 | One row per cell: category, week, dates, C, R, U, L, X, spend, objective, utilisation, status. Totals. Budget check. Autofilter. | Spend = C·X; objective = R·X; utilisation; totals; budget check |
| **2 Weekly plan** | Q2 | Week, dates, spend, objective, share of budget, cumulative spend, weekly cap. Even-pacing reference when pacing is none. | SUMIF over sheet 1 for spend and objective; cumulative sum |
| **3 Capacity** | Q3 | Category: units, capacity, utilisation, status. Cell status counts. | SUMIF; utilisation; status rule; COUNTIF |
| **4 Shadow prices** | Q4 | Ranked binding constraints: type, limit, unit, shadow price, re-solve check, match flag, reading in words. Count verified. | Match flag = |check − price| ≤ 0.1% of the price; count verified |
| **5 Model 2** | Model 2 | Every package: category, week, size, units, cost, value, y (1/0), selected spend and value. Totals and status. | Selected spend and value = cost·y, value·y; totals |

Verified in this build: the workbook was recalculated in LibreOffice. All 28 compared values matched the engine, there were zero formula errors, and all 49 shadow prices were marked "Yes" by the in-sheet formula.

---

## 8. Web interface specification

### 8.1 Information architecture

Five screens, in the order a user works:

1. **Overview** — the answer. Four answer cards (Q1–Q4), four headline numbers, the comparison chart, and the solve pipeline (what was built and checked). Each answer card links to its tab.
2. **Data** — the working. Source choice (bundled sample or CSV upload), detected columns and mapping, data-quality checks, a worked example that turns one cell into C, R, U, L, and the cell table.
3. **Setup** — the inputs. Category, objective, budget share, capacity factor, minimum commitment, pacing, package sizes. Each control has a plain-language tooltip. A live preview shows the budget in dollars and the size of both models.
4. **Results** — five tabs: Q1 Allocation, Q2 Weekly plan, Q3 Capacity, Q4 Shadow prices, Model 2 Packages. Each tab has its formulation, the key numbers, the chart and the full table.
5. **Export & method** — download the workbook, a guide to each sheet, both formulations, where each parameter comes from, and the assumptions and limitations.

### 8.2 Visual design

- **Palette.** Off-white background (`#F6F7F9`), white cards with a 1px border, one accent (deep teal `#0F766E`). Green, amber and red appear only as status colours (proven, not proven, infeasible; capacity-bound, under-utilised, unused).
- **Type.** Inter for the interface. Tabular numerals on every figure so columns line up. Monospace only inside formulas.
- **Units.** Every number has its unit next to it ($, conversions, units, per $).
- **Density.** Comfortable cards; compact tables with sticky headers.
- **Motion.** A thin progress bar while solving; a short fade between pages. Reduced-motion users get no animation.

### 8.3 Interaction states

| State | Behaviour |
|---|---|
| First load | Connects to the solver, runs the bundled sample, shows the Overview. |
| Solver offline | Shows the bundled demo result with a banner. Run and download are disabled and explain why. |
| Solving | Progress bar in the top edge; the current page stays visible and dims. |
| Infeasible | Overview and Results show the reason and a button to open Setup. |
| Bad upload | Inline error naming the missing column or the bad row count. |
| Upload accepted | Column chips, mapping table, and a "Run analysis on this data" button. |
| Export | Button shows a spinner; the file downloads under its run ID. |

### 8.4 Copy rules

- Name the result, then the number, then what it means.
- Say "proven optimal" only when it is. Otherwise say "feasible, not proven".
- Describe the data honestly: "historical display volume used as capacity", not "streaming inventory".
- Put an assumption next to the number it affects.

### 8.5 Accessibility and responsiveness

- Keyboard reachable tabs, segmented controls, sliders and tooltips (tooltips open on focus).
- Status is conveyed by text as well as colour.
- Layouts collapse to one column below 1100 px; navigation becomes a horizontal bar below 860 px.
- Charts show values on hover; their tables are always present below them.

---

## 9. What was removed, and why

| Removed | Reason |
|---|---|
| Carry-over sequential LP | Not in the PDF. Solved greedily week by week but labelled "Optimal". Misleading. |
| Piecewise ad-fatigue LP | Not in the PDF. Its 50% saturation rate was invented, not estimated. |
| Budget-validation sheet | Tautological: B ÷ history equals budget share × capacity factor by construction. The Summary now states B and its basis. |
| Sensitivity-curve sheet and API | Its Model 2 column was copied from Model 1. Its uplift used a different model from the headline. |
| Uncapped-LP sheet | Duplicated Q2 and Q4 with a second model. One model now answers each question. |
| Excel Solver instructions sheet | Manual steps for a check the workbook now does with formulas. |
| "Week N, 2024" labels | The dataset has no year. Weeks are now "Week N" with real dates from the data. |
| Landing marketing page | Added no information. Replaced by the Overview. |
| Hardcoded narrative numbers | Every number now comes from the result document. |
| Ten API endpoints | Consolidated into runs, export and inspect. |

---

## 10. Quality plan

### 10.1 Automated tests

`tests/test_engine.py` (21 tests) and `tests/test_crosscheck.py` (PuLP/CBC against the HiGHS reference, four configurations).

| Area | What is checked |
|---|---|
| Correctness | Default and campaign-revenue LP objectives match reference values. Budget shadow price matches its re-solve. PuLP/CBC and HiGHS agree on every objective (cross-check). |
| PDF formulas | Explicit constraint count = 1 + 2PT (no pacing) and 1 + T + 2PT (even pacing). |
| Feasibility | Budget fully spent when it binds. Every residual check passes for all configurations tested. |
| Model 2 | Proven optimal. Objective ≤ Model 1. Selection is binary and within budget. |
| Q2 | Weekly spend sums to B. Even pacing never beats free timing. |
| Q3 | Cell statuses partition all cells. Category labels follow the 99% and 1% rules. |
| Data handling | Blank categories excluded and counted. Negative cost rejected. Missing column reported by name. |
| Errors | Infeasible plan returns a reason and does not crash. Invalid configuration rejected. |
| Outputs | Result is JSON-serialisable. Workbook has the six required sheets and more than 300 formulas. |

### 10.2 Verification performed in this build

- Independent re-solve of both models with HiGHS (SciPy), outside the engine.
- Finite-difference re-solves for every reported shadow price.
- Excel recalculation in LibreOffice: 28 values compared, 0 formula errors.
- JSX syntax check of all 13 frontend files; icon and relative-import check; scope check for unbound names (with a probe file confirming the checker detects a missing component).

### 10.3 Acceptance criteria (definition of done)

1. `python tests/test_engine.py` reports 20/20.
2. `npm run build` completes with no errors and no unresolved imports.
3. The web app shows all five screens on the bundled sample without console errors.
4. Downloaded workbook opens in Excel with no formula errors and the six sheets in order.
5. Every number on the Overview also appears in the workbook, with the same value.
6. Changing an input on Setup and re-running updates every screen and the workbook.
7. An infeasible configuration shows the reason on Overview, Results and Export.
8. Uploading a malformed CSV shows the error naming the column or row.

---

## 11. Migration from the current project

| Current | Action |
|---|---|
| `backend/solver.py` | Replace with `engine.py`. Delete the old file. |
| `backend/planning.py` | Merge into `engine.py` (`build_dataset`). |
| `backend/exports.py` | Replace with `workbook.py`. Delete the old file (its sheet aliasing caused the clutter). |
| `backend/schemas.py` | Delete. Validation moved to `validate_config()`. Add pydantic later if wanted. |
| `backend/main.py` | Replace with `api.py`. |
| `prepare_assets.py` | Delete. Its paths are wrong, and notebooks are not part of the deliverable. |
| `tests/test_models.py` | Replace with `tests/test_engine.py`. The old file expects sheets that no longer exist. |
| `notebooks/*.ipynb` | Regenerate later from `backend/` if still required. The current notebooks call functions that are removed. |
| `frontend/src/views/*`, `components/*`, `derive.js`, `format.js`, `config.js`, `api.js` | Replace with the new `pages/`, `components/`, `lib/`. |
| `frontend/dist`, `node_modules`, `.pytest_cache`, `__pycache__` | Do not ship. Rebuild on each machine. |
| `adspace-verification (7).xlsx` | Replace with `docs/sample-results.xlsx` (default run). |
| `start.ps1` | Replace with the new one (same name, new module path). |

---

## 12. Phased delivery plan

| Phase | Work | Output | Done when |
|---|---|---|---|
| **0 · Decide** | Answer the decisions in §14 | Written decisions | All five answered |
| **1 · Engine** | Finish and review `engine.py`. Add PuLP adapter if required. | Engine with 20 passing tests | Tests pass under the chosen solver |
| **2 · Workbook** | Review `workbook.py` against §7. Recalculate in Excel. | Sample workbook | No formula errors in Excel |
| **3 · API** | Install FastAPI. Run the server. Exercise each endpoint. | Working API | Each endpoint returns the documented shape |
| **4 · Interface** | `npm install`, `npm run build`, fix any build issues. Walk through all five screens. | Built app | Acceptance criteria 2, 3, 6, 7, 8 |
| **5 · Polish** | Visual pass in the browser at desktop, tablet and phone widths. Check tooltips, focus states, contrast. | Final UI | Acceptance criteria 4, 5 |
| **6 · Hand-over** | Update README, add the report, record a short demo. | Deliverable package | Stakeholder walkthrough completed |

Estimated effort for a developer already familiar with the stack: Phases 0–2 about 1 day; Phases 3–5 about 2–3 days; Phase 6 half a day.

---

## 13. What was verified in this build, and what was not

**Verified in this build**

- The engine logic runs end to end on the bundled CSV in about 0.35 s on the reference solver. Results match your original CBC workbook and an independent HiGHS solve: LP 603,772.34 (default); campaign-revenue LP 301,805.24; revenue budget shadow price 1.3471 (your CBC value: 1.3471341).
- 21 engine tests pass on the reference solver.
- Every shadow price verifies in all four configurations tested (49, 50, 24 and 65 rows).
- The workbook recalculates in LibreOffice with zero formula errors. Live checks return 0 violations; the 49 Q4 rows all show "Yes".
- The figures (Matplotlib and Seaborn) render and match the workbook values.
- All 13 frontend files parse; every icon and relative import resolves; no unbound names (checked with a probe file).

**Not verified in this build (these need your machine)**

- **PuLP and CBC were not executed.** Neither is installable here: PuLP is not on the machine and the network cannot reach the package mirror, and the CBC binary from apt cannot be downloaded. The PuLP code uses the same calls as your original working solver. Run `python tests/test_crosscheck.py` to confirm the PuLP results agree with the reference.
- **The web app was not built or viewed in a browser.** The `node_modules` in the zip does not contain a Linux Rollup binary, and there is no network to install one. Run `npm install` and `npm run build` in `frontend/`.
- **FastAPI was not executed over HTTP.** The module compiles. Start the server and open `/docs`.

**Commands that complete the verification**

```bash
pip install -r backend/requirements.txt          # includes pulp==2.8.0
python tests/test_engine.py                      # 21 tests, PuLP + CBC
pip install -r requirements-dev.txt              # adds SciPy for the cross-check
python tests/test_crosscheck.py                  # PuLP/CBC against HiGHS
python scripts/build_fixture.py                  # refresh the offline demo with PuLP
python scripts/build_workbook_demo.py            # sample workbook with PuLP
python scripts/make_figures.py                   # figures with PuLP
cd frontend && npm install && npm run build
```

## 14. Decisions (resolved)

Your instruction was to use the PDF's tools as stated, and to apply the same principle to the other open decisions. Each decision and how it now follows the PDF:

| Decision | Resolution | PDF basis |
|---|---|---|
| Solver | PuLP with CBC for LP and IP; HiGHS only as a reference for cross-checks | Slide 8: "PuLP with CBC solver" |
| Sensitivity | LP dual values from the solver, each re-checked by re-solving | Slide 8: "LP dual values / shadow prices"; slide 19 |
| Data cleaning | Pandas and NumPy | Slide 8: "Python (Pandas, NumPy)" |
| Visualisation | Matplotlib and Seaborn figures for the report; Recharts in the interactive app | Slide 8: "Matplotlib / Seaborn" |
| Cross-check | Excel formulas, the Excel Solver setup block in the Summary, and live checks | Slide 8: "Excel Solver for cross-checking" |
| Weekly caps (Q2) | Model 1 always carries B_t. Default B_t = B (non-binding), so Q2 is the free-timing pattern; even pacing selectable | Slide 11: B_t is a managerial input in Model 1 |
| Model 2 packages | Synthetic 25/50/100% blocks, labelled as an assumption, because the dataset has no packages. Category-week cap W_pt is a separate dollar input | Slides 14–15: packages have fixed cost and value; W_pt is distinct from U_pt |
| Category default | Placement (5 categories × 13 weeks). Campaign is selectable | Slide 4: "campaign / placement — define the planning category" |
| Objective default | Conversions | Slide 12: conversions is the objective; revenue is a substitute |
| Week labels | "Week N" with real dates, no year | Dataset has no year field |
| Extras (carry-over, piecewise) | Removed | Not in the PDF |

Still open for you: nothing in the PDF's tool stack remains unused. If you want the package sizes changed or a different category as the default, change `DEFAULT_CONFIG` in `backend/engine.py`.

## 15. Known limitations of the model (state these in the report)

- Returns are linear: each unit earns the same rate, so the model never saturates a placement. The PDF lists this as a limitation (slide 16).
- Rates are deterministic historical averages. They are not forecasts, and realised conversions may differ.
- Historical displays cap capacity at observed volume unless the capacity factor is raised, which is a managerial assumption, not evidence.
- Model 2 packages do not come from a supplier catalogue; the dataset has no prices.
- The dataset covers April to June (13 weeks), three campaigns and five placements. Conclusions apply to that period and those placements only.
- 413 rows (2.7%) have no placement. They carry about 0.002% of cost and no conversions, so excluding them does not change the results.

## 16. PDF tool stack (slide 8) and where each tool is used

| PDF row | Tool | Where it is used |
|---|---|---|
| Data cleaning & aggregation | Python, Pandas, NumPy | `backend/engine.py` (`build_dataset`) |
| Visualization | Matplotlib, Seaborn | `scripts/make_figures.py` → `docs/figures/` (report figures) |
| LP formulation & solving | PuLP with CBC; Excel Solver for cross-checking | `backend/solvers.py` (`PuLPCBC`); workbook Summary, "Excel Solver cross-check" block and live checks |
| Sensitivity analysis | LP dual values / shadow prices | `PuLPCBC.solve` returns constraint `pi` values; `answer_q4` verifies each one |
