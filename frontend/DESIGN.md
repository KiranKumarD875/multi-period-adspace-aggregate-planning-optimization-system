# Adspace Planner · interface design

## Concept: "Paper Console"

A planning console for ad budgets. It is light and warm, like printed campaign plans, not a dark dashboard.
The design shows the work in order: data, selections, solve, results, workbook. The stepper across the top is the process.

## Why it fits ad optimisation

- **Signal orange is spend and action.** It marks the budget, the primary button, the selected option and the highest value.
- **Blue is Model 1 (LP), violet is Model 2 (0/1 packages).** Each model keeps its colour across every chart and badge.
- **Status colours are reserved for status** (proven, not proven, infeasible, capacity-bound, under-utilised).
- **Numbers are the hero.** Display type for headline figures, tabular figures in tables, units beside every value.

## Type

| Role | Face | Use |
|---|---|---|
| Display | Space Grotesk 500–700 | Titles, headline metrics, answer figures |
| Body | IBM Plex Sans 400–700 | Text, labels, tables |
| Mono | IBM Plex Mono | Formulas, file names, IDs, eyebrows |

## Colour tokens (`src/styles/app.css`)

| Token | Value | Meaning |
|---|---|---|
| `--paper` | `#f4f1ea` | page background |
| `--surface` | `#ffffff` | cards |
| `--ink` | `#1a1d24` | text, primary dark buttons |
| `--accent` | `#ff6b35` | spend, primary action, selection |
| `--lp` | `#2f6fed` | Model 1 |
| `--ip` | `#7b5cf5` | Model 2 |
| `--ok` / `--warn` / `--bad` | green / amber / red | status only |

## Layout

- Top bar: brand, five-step process stepper, live solver status. Sticky, with a blurred background.
- Content: one column for Data and Solve; two columns (content + live plan rail) for Model, Results and Workbook.
- The plan rail shows the current selections. Anything changed since the last run is marked "changed", and a banner says the results are stale.
- Breakpoints: rail moves above content at 1180 px; the stepper hides its hints and the header collapses at 1040 px; single column at 720 px.

## Motion

| Moment | Motion | Duration |
|---|---|---|
| Page change | slides 18 px in the direction of travel, fades | 280 ms |
| Cards on load | rise 12 px, staggered by `--delay` | 640 ms |
| Metrics | count up from zero (or from the previous value) | 900 ms |
| Stepper progress | fill grows with the step | 640 ms |
| Stepper step done | check icon pops | 380 ms |
| Segmented control | highlight slides to the new option | 280 ms |
| Sliders | fill follows the thumb; thumb scales when pressed | 160 ms |
| Solve pipeline | stages advance one at a time; the active stage pulses | 780 ms per stage |
| Charts | bars grow, lines draw | 900–1100 ms |
| Notifications | slide in from the right | 380 ms |

With `prefers-reduced-motion`, movement and looping animation are removed; state changes still happen immediately.

## Process showcase (Solve step)

The server call is one request, so the six stages advance on a timer while it runs. The figures under each stage are the real
results, shown only when the response arrives. After a successful solve the app moves to Results once the stages have shown.

## States

| State | What the user sees |
|---|---|
| Connecting | info banner; status chip reads "Connecting…" |
| Live | status chip with a pulsing green dot and the solver name |
| Offline | warning banner; the bundled result is shown; Run and Download are disabled with a reason |
| Solving | progress bar at the top of the pipeline; stages advance; the Run button shows a spinner |
| Solver error | red banner with the message and a Retry button |
| Results stale | amber banner on Results and the plan rail; Download re-runs first |
| Infeasible | red banner explaining the plan cannot be built, with a link to change the selections |
| Bad upload | red banner under the source cards naming the missing column or the bad value |

## Workbook

The download is built from the selections on screen. The sheet cards show the live value each sheet holds for the current selections.
If the selections have changed, downloading re-runs the analysis first. The file name records the objective, category, budget and pacing,
for example `adspace_revenue_placement_budget85_<run>.xlsx`.

## Accessibility

- Every control has a visible label or an `aria-label`. Segmented controls use `radiogroup` and `aria-checked`.
- Focus rings are visible on every interactive element.
- Status is conveyed by text and icon, not colour alone.
- Tooltips open on hover and on keyboard focus.
- Banners use `role="alert"` for errors and `role="status"` otherwise.

## Files

| File | Purpose |
|---|---|
| `src/App.jsx` | step state, selections, solve flow, workbook download, status |
| `src/components/primitives.jsx` | buttons, cards, animated metrics, segmented control, sliders, tables, notifications |
| `src/components/process.jsx` | stepper, plan rail, solve pipeline |
| `src/components/charts.jsx` | Recharts charts in the palette above |
| `src/pages/DataAndModel.jsx` | Data step and Model step |
| `src/pages/SolveResultsWorkbook.jsx` | Solve, Results and Workbook steps |
| `src/lib/*.js` | formatting, defaults, API client, stale-result logic |
| `src/styles/app.css` | tokens, components, motion, responsive rules |
