# Multi-Period Ad-Space Aggregate Planning & Optimization System

[![Python Version](https://img.shields.io/badge/python-3.11%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.0-646CFF.svg)](https://vitejs.dev/)
[![Solver](https://img.shields.io/badge/Solver-PuLP%20%7C%20COIN--OR%20CBC-orange.svg)](https://github.com/coin-or/pulp)
[![Status](https://img.shields.io/badge/Tests-21%20Passed-brightgreen.svg)]()

An end-to-end Operations Research decision-support platform designed to solve **multi-period aggregate planning and budget allocation** for streaming and digital ad spaces.

The system formulates and solves continuous **Linear Programming (LP)** and discrete **0/1 Integer Programming (IP)** models to maximize advertising conversions or revenue under multi-period budget limits, publisher inventory capacities, and minimum delivery commitments. It includes comprehensive sensitivity analysis via LP dual shadow prices, automated cross-checks against independent solvers, dynamic multi-sheet Excel generation, and an interactive modern web dashboard.

---

## Key Features

- **Dual Optimization Formulations**:
  - **Model 1 (Continuous LP)**: Optimizes continuous ad impression volumes across channels and time periods using PuLP with COIN-OR CBC.
  - **Model 2 (Discrete 0/1 IP)**: Solves discrete ad package selection under equivalent budget knapsacks, guaranteed by theoretical upper-bound certificates ($Z_{\text{IP}} \le Z_{\text{LP}}$).
- **Core Operations Research Answers**:
  - **Q1 (Optimal Allocation)**: Detailed unit allocations and spend across categories and weekly periods.
  - **Q2 (Pacing Pattern)**: Optimal temporal spend distribution across the campaign duration.
  - **Q3 (Capacity Diagnostics)**: Identifies capacity-bound channels vs. under-utilized inventory.
  - **Q4 (Sensitivity & Shadow Prices)**: Exact LP dual marginal values validated against numerical finite-difference re-solves.
- **Interactive "Paper Console" Web UI**:
  - 5-step guided workflow: Data inspection, model configuration, live solver pipeline, analytical results dashboard, and Excel export.
  - Built with React 18, Vite, IBM Plex typography, and Recharts visualization.
- **Dynamic Excel Engine**:
  - Exports complete 6-sheet audit-ready Excel workbooks (`.xlsx`) populated with **live native Excel formulas** (SUM, SUMPRODUCT) for external validation.
- **Dual-Solver Verification**:
  - Production solves powered by **PuLP (CBC)**, independently verified against **SciPy HiGHS**.

---

## Mathematical Formulation

### Model 1 · Continuous Linear Programming (LP)

$$\max \sum_{p \in P} \sum_{t \in T} R_{pt} X_{pt}$$

$$\text{subject to:}$$

$$\sum_{p \in P} \sum_{t \in T} C_{pt} X_{pt} \le B \quad \text{(Total Budget)}$$

$$\sum_{p \in P} C_{pt} X_{pt} \le B_t \quad \forall t \in T \quad \text{(Weekly Period Budget Cap)}$$

$$X_{pt} \le U_{pt} \quad \forall p \in P, \forall t \in T \quad \text{(Inventory Capacity Upper Bound)}$$

$$X_{pt} \ge L_{pt} \quad \forall p \in P, \forall t \in T \quad \text{(Minimum Delivery Commitment)}$$

$$X_{pt} \ge 0 \quad \forall p \in P, \forall t \in T$$

Where:
- $X_{pt}$: Decision variable for ad units allocated to category/channel $p$ in week $t$.
- $R_{pt}$: Return coefficient (conversion rate or revenue per impression unit).
- $C_{pt}$: Cost per unit.
- $B$: Total available campaign budget.
- $B_t$: Maximum spend allowed in period $t$ (controlled by pacing rules).
- $U_{pt}, L_{pt}$: Publisher capacity upper bound and minimum baseline commitment.

### Model 2 · Discrete 0/1 Knapsack Integer Programming (IP)

$$\max \sum_{j \in J} v_j y_j$$

$$\text{subject to:}$$

$$\sum_{j \in J} c_j y_j \le B, \quad \sum_{j \in (p, t)} c_j y_j \le W_{pt}, \quad y_j \in \{0, 1\}$$

Where discrete ad package bundles $j$ are selected under knapsack budget constraints.

---

## Interactive Web Interface

The frontend is structured as a tactile 5-step console that guides the user through the aggregate planning workflow:

1. **Step 1 · Data**:
   - Inspect the bundled campaign dataset or upload custom CSV performance logs.
   - Automatic column mapping for impressions, clicks, conversions, revenue, and costs.
   - Worked example card demonstrating parameter derivations ($C_{pt}, R_{pt}, U_{pt}, L_{pt}$).
2. **Step 2 · Setup**:
   - Configure optimization objective: **Maximize Conversions** or **Maximize Revenue**.
   - Choose category grouping: by **Placement Channel** or by **Campaign ID**.
   - Set budget fraction ($B$) and adjust capacity multipliers ($U$).
   - Choose weekly pacing strategies: **None / Free Pacing**, **Even Pacing**, **Front-Loaded**, or **Back-Loaded**.
3. **Step 3 · Solve Pipeline**:
   - Live visual execution tracker displaying status as the solver constructs constraints, invokes CBC, parses dual variables, and runs Model 2.
4. **Step 4 · Results**:
   - High-level KPIs: Total Conversions, Total Spend, Budget Utilization, and Model 2 Comparison.
   - Interactive charts: Weekly spend distribution, channel allocation shares, and capacity utilization heatmaps.
   - Detailed bottleneck table displaying binding constraints and shadow prices (marginal value of an extra budget dollar or capacity unit).
5. **Step 5 · Export**:
   - Live preview of the 6-sheet workbook.
   - One-click download of the generated `.xlsx` workbook containing live formulas.

---

## Repository Structure

```
.
├── backend/
│   ├── __init__.py
│   ├── api.py             # FastAPI REST endpoints & static file serving
│   ├── engine.py          # OR engine: data aggregation, LP/IP models, Q1-Q4 metrics
│   ├── solvers.py         # PuLP/CBC production solver & HiGHS cross-check backend
│   ├── workbook.py        # 6-sheet Excel generator with live native formulas
│   └── requirements.txt   # Backend Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/    # Recharts visualizers, process stepper, UI primitives
│   │   ├── pages/         # Step pages (Data, Model, Solve, Results, Workbook)
│   │   ├── lib/           # API client, formatting helpers, and state handlers
│   │   ├── styles/        # CSS tokens and design system variables
│   │   ├── App.jsx        # Root application workflow controller
│   │   └── main.jsx       # React entry point
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── DESIGN.md          # Interface design specification
├── data/
│   └── online_advertising_performance_data.csv   # Bundled multi-channel ad dataset
├── docs/
│   ├── figures/           # Analytical charts and model comparison figures
│   └── sample-results.xlsx # Sample generated output workbook
├── scripts/
│   ├── build_fixture.py   # Fixture generation script
│   ├── build_workbook_demo.py # Offline Excel workbook builder
│   └── make_figures.py    # Generates report plots and charts
├── tests/
│   ├── test_engine.py     # 21 automated acceptance tests (PuLP + CBC)
│   └── test_crosscheck.py # Independent HiGHS cross-validation test suite
├── .gitignore
├── requirements-dev.txt   # Development and test dependencies
├── start.bat              # One-click Windows runner script
└── README.md
```

---

## Prerequisites & Installation

### Requirements
- **Python**: Version 3.11 or higher
- **Node.js**: Version 18.0 or higher (with `npm`)

### 1. Backend Setup

```bash
# Clone the repository
git clone https://github.com/KiranKumarD875/multi-period-adspace-aggregate-planning-optimization-system.git
cd multi-period-adspace-aggregate-planning-optimization-system

# Create and activate a Python virtual environment
python -m venv .venv

# Windows (Command Prompt / PowerShell):
.venv\Scripts\activate
# macOS / Linux:
# source .venv/bin/activate

# Install backend dependencies
pip install -r backend/requirements.txt
```

### 2. Frontend Setup

In a separate terminal:

```bash
cd frontend
npm install
```

---

## Running the Application

### Option A: Development Mode (Recommended for testing & development)

1. **Start the FastAPI backend** (runs on port `8010`):
   ```bash
   python -m uvicorn backend.api:app --host 127.0.0.1 --port 8010 --reload
   ```

2. **Start the Vite development server** (runs on port `5180`):
   ```bash
   cd frontend
   npm run dev
   ```

3. Open **`http://localhost:5180`** in your browser. (Vite automatically proxies API requests to `http://127.0.0.1:8010`).

---

### Option B: Production / Standalone Mode

1. **Build the frontend**:
   ```bash
   cd frontend
   npm run build
   cd ..
   ```

2. **Run the server** (FastAPI serves both the API and the compiled frontend):
   ```bash
   python -m uvicorn backend.api:app --host 127.0.0.1 --port 8010
   ```

3. Open **`http://127.0.0.1:8010`** in your browser.

> On Windows, you can also double-click **`start.bat`** to automatically start the server and open the application in your browser.

---

## Testing & Verification Suite

The repository includes a comprehensive automated test suite verifying solver correctness, constraint adherence, shadow price calculations, and solver cross-checks.

```bash
# Run acceptance tests (21 tests, PuLP + CBC)
python tests/test_engine.py

# Install test dependencies for cross-checking
pip install -r requirements-dev.txt

# Run independent solver cross-check (PuLP/CBC vs. SciPy HiGHS)
python tests/test_crosscheck.py
```

---

## Technologies Used

- **Operations Research & Solvers**: [PuLP](https://github.com/coin-or/pulp) (COIN-OR CBC), [SciPy](https://scipy.org/) (HiGHS backend), [NumPy](https://numpy.org/), [Pandas](https://pandas.pydata.org/).
- **Backend**: [FastAPI](https://fastapi.tiangolo.com/), [Uvicorn](https://www.uvicorn.org/), [OpenPyXL](https://openpyxl.readthedocs.io/) (formula-driven Excel creation).
- **Frontend**: [React 18](https://react.dev/), [Vite](https://vitejs.dev/), [Recharts](https://recharts.org/), [Lucide Icons](https://lucide.dev/).
- **Testing**: [pytest](https://docs.pytest.org/).

---

## License

This project is licensed under the MIT License.
