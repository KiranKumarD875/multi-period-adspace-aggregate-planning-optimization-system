"""Solver layer.

Production backend: PuLP with the CBC solver (mid-review, slide 8).
Reference backend:  SciPy HiGHS, used only to cross-check PuLP/CBC in tests and
                    when the environment variable ADSPACE_SOLVER=highs is set.

Both backends take the same problem description and return the same fields, so the
engine never knows which one ran.

Problem description
  obj    list of objective coefficients (maximisation)
  rows   list of dicts: {"id": str, "terms": {var_index: coef}, "sense": "<=" | ">=", "rhs": float}
  ub     optional list of upper bounds (None = unbounded), used for the 0-1 relaxation
  binary True for 0/1 variables (integer program)

Result fields
  status    "Optimal" | "Infeasible" | "Unbounded" | "Not solved" | "Feasible"
  proven    True only when the solver certifies optimality
  x         list of variable values (None if no solution)
  objective float or None
  duals     {row id: dual value} for LPs (raw; the engine normalises the sign by row sense)
"""
from __future__ import annotations

import os
import time

TIME_LIMIT_SECONDS = 60


class SolverUnavailable(RuntimeError):
    pass


# ---------------------------------------------------------------------------
# PuLP + CBC (production)
# ---------------------------------------------------------------------------
class PuLPCBC:
    name = "PuLP"

    def __init__(self):
        try:
            import pulp
        except ImportError as exc:  # pragma: no cover - environment dependent
            raise SolverUnavailable("PuLP is not installed. Run: pip install -r backend/requirements.txt") from exc
        self.pulp = pulp
        self.version = pulp.__version__
        self._cbc = pulp.PULP_CBC_CMD(msg=False)
        if not self._cbc.available():  # pragma: no cover - environment dependent
            raise SolverUnavailable("The CBC solver shipped with PuLP was not found on this machine.")

    def label(self):
        return f"PuLP {self.version} · CBC"

    def _cbc_command(self):
        # timeLimit bounds the integer search.
        return self.pulp.PULP_CBC_CMD(msg=False, timeLimit=TIME_LIMIT_SECONDS)

    def solve(self, obj, rows, ub=None, binary=False):
        pulp = self.pulp
        n = len(obj)
        prob = pulp.LpProblem("planning", pulp.LpMaximize)
        if binary:
            xs = [pulp.LpVariable(f"y{i}", cat="Binary") for i in range(n)]
        else:
            xs = [pulp.LpVariable(f"x{i}", lowBound=0,
                                  upBound=(None if ub is None else ub[i])) for i in range(n)]
        prob += pulp.lpSum(obj[i] * xs[i] for i in range(n))
        for r in rows:
            if not r["terms"]:
                continue
            expr = pulp.lpSum(coef * xs[i] for i, coef in r["terms"].items())
            if r["sense"] == "<=":
                prob.addConstraint(expr <= r["rhs"], r["id"])
            else:
                prob.addConstraint(expr >= r["rhs"], r["id"])

        started = time.perf_counter()
        prob.solve(self._cbc_command())
        seconds = time.perf_counter() - started

        status_text = pulp.LpStatus[prob.status]
        values = [v.value() for v in xs]
        has_solution = all(v is not None for v in values)

        if binary:
            proven = prob.status == pulp.LpStatusOptimal and prob.sol_status == pulp.LpSolutionOptimal
            if proven:
                status = "Optimal"
            elif has_solution and prob.sol_status == pulp.LpSolutionIntegerFeasible:
                status = "Feasible"
            else:
                status = "Infeasible" if prob.status == pulp.LpStatusInfeasible else "Not solved"
        else:
            proven = prob.status == pulp.LpStatusOptimal
            status = "Optimal" if proven else ("Infeasible" if prob.status == pulp.LpStatusInfeasible else status_text)

        if not has_solution:
            return {"status": status, "proven": False, "x": None, "objective": None, "duals": {}, "seconds": seconds}

        duals = {}
        if not binary:
            for r in rows:
                if not r["terms"]:
                    continue
                pi = prob.constraints[r["id"]].pi
                duals[r["id"]] = float(pi) if pi is not None else 0.0
        return {
            "status": status,
            "proven": bool(proven),
            "x": [float(v) for v in values],
            "objective": float(pulp.value(prob.objective)),
            "duals": duals,
            "seconds": seconds,
        }


# ---------------------------------------------------------------------------
# SciPy HiGHS (reference only)
# ---------------------------------------------------------------------------
class HiGHSReference:
    name = "HiGHS reference"

    def __init__(self):
        try:
            import numpy as np  # noqa: F401
            import scipy  # noqa: F401
        except ImportError as exc:  # pragma: no cover
            raise SolverUnavailable("SciPy is required for the HiGHS reference backend.") from exc
        self.version = scipy.__version__

    def label(self):
        return f"SciPy {self.version} · HiGHS (reference)"

    def solve(self, obj, rows, ub=None, binary=False):
        import numpy as np
        from scipy.optimize import Bounds, LinearConstraint, linprog, milp

        n = len(obj)
        rows = [r for r in rows if r["terms"]]
        dense = np.zeros((len(rows), n))
        for k, r in enumerate(rows):
            for i, coef in r["terms"].items():
                dense[k, i] = coef
        c = -np.array(obj, dtype=float)
        started = time.perf_counter()
        if binary:
            lo = np.array([-np.inf if r["sense"] == "<=" else r["rhs"] for r in rows])
            hi = np.array([r["rhs"] if r["sense"] == "<=" else np.inf for r in rows])
            res = milp(c, constraints=LinearConstraint(dense, lo, hi), integrality=np.ones(n),
                       bounds=Bounds(0, 1), options={"mip_rel_gap": 1e-9, "time_limit": TIME_LIMIT_SECONDS})
            seconds = time.perf_counter() - started
            if res.x is None:
                return {"status": "Infeasible", "proven": False, "x": None, "objective": None,
                        "duals": {}, "seconds": seconds}
            proven = res.status == 0
            x = [float(round(v)) for v in res.x]
            return {"status": "Optimal" if proven else "Feasible", "proven": bool(proven), "x": x,
                    "objective": float(np.dot(obj, x)), "duals": {}, "seconds": seconds}

        A, b = [], []
        for k, r in enumerate(rows):
            if r["sense"] == "<=":
                A.append(dense[k]); b.append(r["rhs"])
            else:
                A.append(-dense[k]); b.append(-r["rhs"])
        bounds = [(0, None if ub is None else ub[i]) for i in range(n)]
        res = linprog(c, A_ub=np.array(A) if A else None, b_ub=np.array(b) if b else None,
                      bounds=bounds, method="highs")
        seconds = time.perf_counter() - started
        if res.status != 0:
            return {"status": "Infeasible" if res.status == 2 else "Not solved", "proven": False,
                    "x": None, "objective": None, "duals": {}, "seconds": seconds}
        duals = {r["id"]: float(res.ineqlin.marginals[k]) for k, r in enumerate(rows)}
        return {"status": "Optimal", "proven": True, "x": [float(v) for v in res.x],
                "objective": float(-res.fun), "duals": duals, "seconds": seconds}


def get_backend(name: str | None = None):
    """PuLP + CBC unless the reference backend is requested explicitly."""
    choice = (name or os.environ.get("ADSPACE_SOLVER") or "pulp").lower()
    if choice == "pulp":
        return PuLPCBC()
    if choice in ("highs", "reference"):
        return HiGHSReference()
    raise ValueError("ADSPACE_SOLVER must be 'pulp' (default) or 'highs'.")
