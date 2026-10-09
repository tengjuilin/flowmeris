"""
Generate golden reference fixtures for Flowmeris from FlowKit (Gating-ML 2.0 compliant), NumPy, SciPy
and pandas.

Usage (from repo root):
    uv run --project tools/golden/python python tools/golden/python/generate.py

Inputs the app itself writes (Gating-ML, gated-event FCS files and a manifest per scenario) are read
from fixtures/golden/inputs/; `corepack pnpm golden` writes them first (packages/export/test).

Outputs are written to fixtures/golden/. Every value is serialised with Python's repr (shortest
round-trip float formatting), so the TypeScript tests compare against exact IEEE-754 doubles.
"""

from __future__ import annotations

import base64
import hashlib
import json
import math
import platform
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import flowkit as fk
import flowio
import numpy as np
import pandas as pd
import scipy
from scipy import ndimage, stats as sps

ROOT = Path(__file__).resolve().parents[3]
FIX = ROOT / "fixtures"
OUT = FIX / "golden"
INPUTS = OUT / "inputs"

FCS_FILES = [
    "flowkit/gate_ref/data1.fcs",
    "flowkit/test_comp_example.fcs",
    "flowkit/test_data_2d_01.fcs",
    "flowkit/data_set_simple_line_100.fcs",
    "flowio/100715.fcs",
    "flowio/3FITC_4PE_004.fcs",
    "flowio/B01 KC-A-W---91-US.fcs",
    "flowio/G11.fcs",
    "flowio/coulter.lmd",
    "flowio/data1.fcs",
    "flowio/variable_int_example.fcs",
    "flowio/data_start_offset_discrepancy_example.fcs",
    "flowio/data_stop_offset_discrepancy_example.fcs",
    "remote/101_DEN084Y5_15_E01_008_clean.fcs",
    # Gated events written by the app (FCS 3.1, float32).
    *sorted(f"golden/inputs/{p.name}" for p in INPUTS.glob("*.fcs")),
]


def finite_list(a):
    return [None if not math.isfinite(float(v)) else float(v) for v in a]


def fin(v):
    """A float, or None when not finite (JSON has no NaN/Inf)."""
    return float(v) if v is not None and math.isfinite(float(v)) else None


def write(rel: str, obj) -> None:
    path = OUT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj))


def row_indices(n: int, seed: int = 20241005) -> list[int]:
    rng = np.random.default_rng(seed)
    idx = set(range(min(10, n))) | set(range(max(0, n - 10), n)) | {n // 2}
    if n > 0:
        idx |= set(int(i) for i in rng.integers(0, n, size=min(50, n)))
    return sorted(idx)


def golden_fcs():
    out_dir = OUT / "fcs"
    out_dir.mkdir(parents=True, exist_ok=True)
    index = []
    for rel in FCS_FILES:
        path = FIX / rel
        if not path.exists():
            print(f"skip (missing) {rel}")
            continue
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            try:
                s = fk.Sample(str(path), ignore_offset_error=True, ignore_offset_discrepancy=True, subsample=0)
            except Exception as e:  # noqa: BLE001
                print(f"FlowKit failed on {rel}: {e}")
                index.append({"file": rel, "flowkit_error": str(e)})
                continue
        raw = s.get_events(source="raw")
        n = raw.shape[0]
        rows = row_indices(n)
        rec = {
            "file": rel,
            "version": s.version,
            "event_count": int(n),
            "pnn": list(s.pnn_labels),
            "pns": list(s.pns_labels),
            "png": finite_list(s.channels["png"].values),
            "pnr": finite_list(s.channels["pnr"].values),
            "pne": [list(map(float, x)) for x in s.channels["pne"].values],
            "rows": rows,
            "raw_rows": [finite_list(raw[i]) for i in rows],
            "col_sum": [math.fsum(raw[:, j]) for j in range(raw.shape[1])],
            "col_min": finite_list(raw.min(axis=0)) if n else [],
            "col_max": finite_list(raw.max(axis=0)) if n else [],
        }
        spill = s.metadata.get("spill") or s.metadata.get("spillover")
        if spill:
            rec["spill_keyword"] = spill
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    s.apply_compensation(spill)
                comp = s.get_events(source="comp")
                rec["comp_rows"] = [finite_list(comp[i]) for i in rows]
                rec["comp_col_sum"] = [math.fsum(comp[:, j]) for j in range(comp.shape[1])]
            except ValueError as e:
                rec["comp_error"] = str(e)
        name = Path(rel).name + ".json"
        (out_dir / name).write_text(json.dumps(rec))
        index.append({"file": rel, "golden": f"fcs/{name}", "events": int(n)})
        print(f"fcs golden: {rel} ({n} events)")
    (out_dir / "index.json").write_text(json.dumps(index, indent=1))


def golden_comp_csv():
    """Compensation with an external matrix (FlowKit test_comp_example + comp_complete_example.csv)."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        s = fk.Sample(
            str(FIX / "flowkit/test_comp_example.fcs"),
            compensation=str(FIX / "flowkit/comp_complete_example.csv"),
            ignore_offset_error=True,
            subsample=0,
        )
    comp = s.get_events(source="comp")
    rows = row_indices(comp.shape[0])
    m = s.compensation
    rec = {
        "file": "flowkit/test_comp_example.fcs",
        "matrix_csv": "flowkit/comp_complete_example.csv",
        "detectors": list(m.fluorochomes) if hasattr(m, "fluorochomes") else list(m.detectors),
        "rows": rows,
        "comp_rows": [finite_list(comp[i]) for i in rows],
        "comp_col_sum": [math.fsum(comp[:, j]) for j in range(comp.shape[1])],
    }
    (OUT / "comp_csv.json").write_text(json.dumps(rec))


def golden_comp_spill_8color():
    """$SPILLOVER keyword compensation on the 8-colour sample."""
    path = FIX / "remote/101_DEN084Y5_15_E01_008_clean.fcs"
    if not path.exists():
        return
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        s = fk.Sample(str(path), subsample=0)
        s.apply_compensation(s.metadata["spillover"])
    comp = s.get_events(source="comp")
    rows = row_indices(comp.shape[0])
    rec = {
        "file": "remote/101_DEN084Y5_15_E01_008_clean.fcs",
        "pnn": list(s.pnn_labels),
        "rows": rows,
        "comp_rows": [finite_list(comp[i]) for i in rows],
    }
    (OUT / "comp_spill_8color.json").write_text(json.dumps(rec))


def golden_transforms():
    xs = np.concatenate(
        [
            -np.logspace(4, -2, 25),
            [0.0],
            np.logspace(-2, 5.5, 40),
            np.linspace(-500, 500, 21),
            [262144.0, 262143.0, 1e6],
        ]
    )
    cases = []
    for T, W, M, A in [(262144, 0.5, 4.5, 0), (262144, 1.0, 4.5, 0), (10000, 0.5, 4.5, 0), (10000, 1.0, 4.5, 1.0), (1000, 0.0, 4.0, 0.0), (262144, 1.5, 4.5, -1.0)]:
        t = fk.transforms.LogicleTransform(param_t=T, param_w=W, param_m=M, param_a=A)
        y = t.apply(xs.reshape(-1, 1)).ravel()
        cases.append({"kind": "logicle", "params": {"T": T, "W": W, "M": M, "A": A}, "x": finite_list(xs), "y": finite_list(y)})
    for T, W, M, A in [(262144, 0.5, 4.5, 0), (10000, 1.0, 4.5, 1.0), (1023, 0.5, 4.5, 0)]:
        t = fk.transforms.HyperlogTransform(param_t=T, param_w=W, param_m=M, param_a=A)
        y = t.apply(xs.reshape(-1, 1)).ravel()
        cases.append({"kind": "hyperlog", "params": {"T": T, "W": W, "M": M, "A": A}, "x": finite_list(xs), "y": finite_list(y)})
    for T, M, A in [(262144, 4.5, 0), (10000, 5, 1), (1000, 4, 0)]:
        t = fk.transforms.AsinhTransform(param_t=T, param_m=M, param_a=A)
        y = t.apply(xs.reshape(-1, 1)).ravel()
        cases.append({"kind": "fasinh", "params": {"T": T, "M": M, "A": A}, "x": finite_list(xs), "y": finite_list(y)})
    for T, A in [(262144, 0), (1000, 100)]:
        t = fk.transforms.LinearTransform(param_t=T, param_a=A)
        y = t.apply(xs.reshape(-1, 1)).ravel()
        cases.append({"kind": "flin", "params": {"T": T, "A": A}, "x": finite_list(xs), "y": finite_list(y)})
    pos = xs[xs > 0]
    for T, M in [(262144, 4.5), (10000, 5)]:
        t = fk.transforms.LogTransform(param_t=T, param_m=M)
        y = t.apply(pos.reshape(-1, 1)).ravel()
        cases.append({"kind": "flog", "params": {"T": T, "M": M}, "x": finite_list(pos), "y": finite_list(y)})
    (OUT / "transforms.json").write_text(json.dumps(cases))


def golden_stats():
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        s = fk.Sample(str(FIX / "flowkit/gate_ref/data1.fcs"), subsample=0)
    raw = s.get_events(source="raw")
    out = []
    for j, name in enumerate(s.pnn_labels):
        x = raw[:, j]
        pos = x[x > 0]
        ps = [1, 2.5, 15.87, 25, 50, 75, 84.13, 97.5, 99]
        out.append(
            {
                "channel": name,
                "n": int(x.size),
                "mean": float(np.mean(x)),
                "sd": float(np.std(x, ddof=1)),
                "median": float(np.median(x)),
                "min": float(x.min()),
                "max": float(x.max()),
                "percentiles": {str(p): float(np.percentile(x, p)) for p in ps},
                "geom_mean_pos": float(np.exp(np.mean(np.log(pos)))) if pos.size else None,
                "n_nonpos": int(x.size - pos.size),
            }
        )
    (OUT / "stats_data1.json").write_text(json.dumps(out))


# ---------------------------------------------------------------------------
# Scenarios written by the app: Gating-ML evaluated by FlowKit, population statistics, FCS export
# ---------------------------------------------------------------------------

FK_TRANSFORMS = {
    "logicle": lambda p: fk.transforms.LogicleTransform(param_t=p["T"], param_w=p["W"], param_m=p["M"], param_a=p["A"]),
    "hyperlog": lambda p: fk.transforms.HyperlogTransform(param_t=p["T"], param_w=p["W"], param_m=p["M"], param_a=p["A"]),
    "fasinh": lambda p: fk.transforms.AsinhTransform(param_t=p["T"], param_m=p["M"], param_a=p["A"]),
    "flin": lambda p: fk.transforms.LinearTransform(param_t=p["T"], param_a=p["A"]),
    "flog": lambda p: fk.transforms.LogTransform(param_t=p["T"], param_m=p["M"]),
}

POP_PERCENTILES = [1, 15.87, 50, 84.13, 99]


def fk_transform(p: dict):
    return FK_TRANSFORMS[p["kind"]](p)


def apply_transform(t, x: np.ndarray) -> np.ndarray:
    with np.errstate(all="ignore"):
        y = t.apply(x.reshape(-1, 1)).ravel().astype(float)
    # Gating-ML leaves log of non-positive values undefined; Flowmeris makes them NaN (M-TR-LOGNP).
    y[~np.isfinite(y)] = np.nan
    return y


def value_stats(x: np.ndarray, ps=POP_PERCENTILES) -> dict:
    """Value statistics as Flowmeris defines them (docs/methods/statistics.md), with NumPy."""
    x = np.asarray(x, dtype=float)
    clean = x[~np.isnan(x)]
    n = int(clean.size)
    out = {"n": n, "n_excluded": int(x.size - n)}
    if n == 0:
        return out
    mean = math.fsum(clean) / n
    sd = float(np.std(clean, ddof=1)) if n > 1 else None
    pct = {str(p): float(np.percentile(clean, p)) for p in ps}
    p84, p16 = float(np.percentile(clean, 84.13)), float(np.percentile(clean, 15.87))
    median = float(np.median(clean))
    rsd = (p84 - p16) / 2
    pos = clean[clean > 0]
    out.update(
        mean=fin(mean),
        sd=fin(sd),
        cv=fin(100 * sd / mean) if sd is not None and mean != 0 else None,
        median=fin(median),
        rsd=fin(rsd),
        rcv=fin(100 * rsd / median) if median != 0 else None,
        geom_mean=fin(math.exp(math.fsum(np.log(pos)) / pos.size)) if pos.size else None,
        geom_n=int(pos.size),
        min=fin(clean.min()),
        max=fin(clean.max()),
        percentiles=pct,
    )
    return out


def packed(mask: np.ndarray) -> str:
    """Membership as base64 of the bits packed little-endian: event i is bit i % 8 of byte i // 8."""
    return base64.b64encode(np.packbits(np.asarray(mask, dtype=bool), bitorder="little").tobytes()).decode()


def scenario_sample(man: dict):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        s = fk.Sample(str(FIX / man["file"]), subsample=0, ignore_offset_error=True)
        comp = man["compensation"]
        if comp["kind"] == "keyword":
            s.apply_compensation(s.metadata.get("spill") or s.metadata["spillover"])
        elif comp["kind"] == "csv":
            s.apply_compensation(str(FIX / comp["path"]))
    return s


def golden_scenarios():
    for path in sorted(INPUTS.glob("*.json")):
        man = json.loads(path.read_text())
        name = man["scenario"]
        if not (FIX / man["file"]).exists():
            print(f"skip scenario {name} (missing {man['file']})")
            continue
        s = scenario_sample(man)
        if hashlib.sha256((FIX / man["file"]).read_bytes()).hexdigest() != man["sha256"]:
            raise SystemExit(f"{man['file']} does not match the scenario's sha256")
        n = s.event_count
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            gs = fk.parse_gating_xml(str(FIX / man["gml"]))
            res = gs.gate_sample(s)

        # Gating: FlowKit's membership of every exported population. Read from the raw results:
        # GatingResults.get_gate_membership misreads non-quadrant gates under pandas ≥ 2.2 (the
        # report's quadrant_parent None becomes NaN).
        raw = {}
        for (g_name, _path), r in res._raw_results.items():
            for sub_name, sub in ([(g_name, r)] if "events" in r else r.items()):
                raw[sub_name] = sub
        member = {"root": np.ones(n, dtype=bool)}
        for p in man["populations"]:
            member[p["id"]] = np.asarray(raw[p["id"]]["events"], dtype=bool)
        pops = {}
        for p in man["populations"]:
            m = member[p["id"]]
            r = raw[p["id"]]
            if int(r["count"]) != int(m.sum()):
                raise SystemExit(f"FlowKit count and membership disagree for {p['id']}")
            pops[p["id"]] = {
                "parent": p["parent"],
                "count": int(m.sum()),
                "parent_count": int(member[p["parent"]].sum()),
                "relative_percent": float(r["relative_percent"]),
                "absolute_percent": float(r["absolute_percent"]),
                "members": packed(m),
            }
        write(f"gml_flowkit/{name}.json", {"scenario": name, "event_count": n, "populations": pops})

        # Statistics of every population on every channel: linear (compensated) and each transform.
        values = s.get_events(source="comp" if man["compensation"]["kind"] != "none" else "raw")
        spaces = {"linear": None, **{tid: fk_transform(p) for tid, p in man["transforms"].items()}}
        cols = {}
        for j, ch in enumerate(s.pnn_labels):
            x = values[:, j].astype(float)
            cols[ch] = {sp: (x if t is None else apply_transform(t, x)) for sp, t in spaces.items()}
        st = {}
        for pid, m in member.items():
            st[pid] = {ch: {sp: value_stats(v[m]) for sp, v in by_space.items()} for ch, by_space in cols.items()}
        write(
            f"stats_populations/{name}.json",
            {"scenario": name, "spaces": list(spaces), "percentiles": POP_PERCENTILES, "populations": st},
        )

        # Gated events written by the app, read back by FlowKit: compared with the engine's events.
        for e in man["fcs_exports"]:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                x = fk.Sample(str(FIX / e["path"]), subsample=0)
            ev = x.get_events(source="raw").astype(np.float64)
            md = x.metadata
            rec = {
                "path": e["path"],
                "pop": e["pop"],
                "mode": e["mode"],
                "version": x.version,
                "event_count": int(x.event_count),
                "flowkit_count": pops[e["pop"]]["count"],
                "pnn": list(x.pnn_labels),
                "pns": list(x.pns_labels),
                "keywords": {
                    k: md.get(k)
                    for k in ["datatype", "byteord", "mode", "par", "tot", "nextdata"]
                },
                "spillover_keywords": sorted(k for k in md if k in ("spill", "spillover", "comp")),
                "flowmeris": {k: v for k, v in md.items() if k.startswith("flowmeris_")},
                # All events, exactly: SHA-256 of the row-major float64 little-endian array.
                "events_sha256": hashlib.sha256(np.ascontiguousarray(ev).astype("<f8").tobytes()).hexdigest(),
                "col_sum": [math.fsum(ev[:, j]) for j in range(ev.shape[1])],
            }
            write(f"fcs_export/{Path(e['path']).stem}.json", rec)
        print(f"scenario golden: {name} ({len(pops)} populations)")


# ---------------------------------------------------------------------------
# Statistics on edge cases, replicate summaries, the t distribution
# ---------------------------------------------------------------------------

EDGE_PERCENTILES = [0, 1, 2.5, 15.87, 25, 50, 75, 84.13, 97.5, 99, 100]


def golden_stats_edge():
    rng = np.random.default_rng(20261009)
    nan = float("nan")
    cases = {
        "empty": [],
        "one": [3.5],
        "two": [-1.0, 4.0],
        "three": [2.0, 9.0, 4.0],
        "all_ties": [7.25] * 9,
        "ties_at_ranks": [float(v) for v in rng.integers(0, 4, size=101)],
        "with_nan": [1.0, nan, 4.0, nan, -2.0, 8.0],
        "only_nan": [nan, nan],
        "nonpositive": [0.0, -3.0, 2.0, 8.0, 0.0, 0.5],
        "all_nonpositive": [0.0, -1.0, -2.5],
        "large_offset": [1e9 + float(v) for v in rng.normal(0, 1, size=1000)],
        "tiny": [float(v) for v in rng.normal(0, 1e-200, size=50)],
        "huge_range": [1e-300, 1.0, 1e300, -1e300, 5.0],
        "zero_mean": [-2.0, -1.0, 0.0, 1.0, 2.0],
        "lognormal": [float(v) for v in rng.lognormal(5, 1.5, size=1001)],
        "integers_even": [float(v) for v in rng.integers(-50, 50, size=1000)],
    }
    out = []
    for name, xs in cases.items():
        r = value_stats(np.array(xs, dtype=float), EDGE_PERCENTILES)
        out.append({"name": name, "x": [None if math.isnan(v) else v for v in xs], **r})
    write("stats_edge.json", {"percentiles": EDGE_PERCENTILES, "cases": out})


def summary(xs: list[float]) -> dict:
    """Replicate summaries (M-STAT-AGG) of the finite values, with NumPy/SciPy."""
    x = np.array([v for v in xs if math.isfinite(v)], dtype=float)
    n = int(x.size)
    sd = float(np.std(x, ddof=1)) if n > 1 else None
    mean = math.fsum(x) / n if n else None
    sem = sd / math.sqrt(n) if sd is not None else None
    return {
        "n": n,
        "mean": fin(mean),
        "sd": fin(sd),
        "sem": fin(sem),
        "ci95": fin(sps.t.ppf(0.975, n - 1) * sem) if sem is not None else None,
        "median": fin(np.median(x)) if n else None,
        "cv": fin(100 * sd / mean) if sd is not None and mean else None,
        "min": fin(x.min()) if n else None,
        "max": fin(x.max()) if n else None,
    }


def golden_aggregate():
    rng = np.random.default_rng(42)
    inf = float("inf")
    vectors = [[float(v) for v in rng.normal(100, 15, size=k)] for k in range(1, 11)]
    vectors += [
        [],
        [5.0, float("nan"), 7.0, inf, -inf, 9.0],
        [1e6 + 0.1, 1e6 + 0.2, 1e6 + 0.3],
        [0.0, 0.0, 0.0],
        [-3.0, 3.0],
        [float(v) for v in rng.lognormal(2, 1, size=48)],
    ]
    cases = [{"x": [v if math.isfinite(v) else ("NaN" if math.isnan(v) else ("Inf" if v > 0 else "-Inf")) for v in xs], **summary(xs)} for xs in vectors]
    ps = [0.9, 0.95, 0.975, 0.995, 0.9995, 0.025, 0.5]
    dfs = list(range(1, 31)) + [40, 59, 60, 61, 120, 1000, 100000]
    tq = [{"p": p, "df": df, "q": float(sps.t.ppf(p, df))} for p in ps for df in dfs]
    ts = [-12.0, -5.0, -2.0, -0.5, 0.0, 0.3, 1.0, 2.5, 10.0, 40.0]
    tc = [{"t": t, "df": df, "cdf": float(sps.t.cdf(t, df))} for t in ts for df in [1, 2, 3, 5, 10, 30, 100]]
    write("aggregate.json", {"cases": cases, "t_quantile": tq, "t_cdf": tc})


# ---------------------------------------------------------------------------
# Statistics table: formula columns, normalisation, grouping (pandas)
# ---------------------------------------------------------------------------

# (Flowmeris formula, the same with NumPy on the row's columns a and b)
FORMULAS = [
    ("[A] / [B]", lambda a, b: a / b),
    ("log([A], 2)", lambda a, b: np.log(a) / np.log(2)),
    ("log([A], 3)", lambda a, b: np.log(a) / np.log(3)),
    ("log([A], 10)", lambda a, b: np.log(a) / np.log(10)),
    ("log([A], 0.5)", lambda a, b: np.log(a) / np.log(0.5)),
    ("log([B], 2.718281828459045)", lambda a, b: np.log(b) / np.log(2.718281828459045)),
    ("ln([A]) - log10([B]) * 2", lambda a, b: np.log(a) - np.log10(b) * 2),
    ("log2([A] + [B])", lambda a, b: np.log2(a + b)),
    ("-[A]^2 + 3", lambda a, b: -(a**2) + 3),
    ("2^3^2 - [A]", lambda a, b: 2 ** (3**2) - a),
    ("([A] - [B]) / ([A] + [B]) * 100", lambda a, b: (a - b) / (a + b) * 100),
    ("sqrt(abs([A] - [B]))", lambda a, b: np.sqrt(np.abs(a - b))),
    ("exp([B] / 1000)", lambda a, b: np.exp(b / 1000)),
    ("min([A], [B], 50)", lambda a, b: np.minimum(np.minimum(a, b), 50)),
    ("max([A], [B])", lambda a, b: np.maximum(a, b)),
    ("[A] * 1.5e-3 - -2", lambda a, b: a * 1.5e-3 + 2),
]


def golden_table():
    rng = np.random.default_rng(7)
    rows = []
    k = 0
    for cond in ["ctrl", "drug"]:
        for dose in [0, 1, 10]:
            for rep in range(1, 4 if dose != 10 else 3):
                k += 1
                a = float(rng.lognormal(5, 0.6))
                b = float(rng.lognormal(6, 0.4))
                if k == 5:
                    a = float("nan")  # a missing statistic
                if k == 7:
                    a = -abs(a)  # log of a negative value
                rows.append({"id": f"s{k}", "cond": cond, "dose": dose, "rep": rep, "A": a, "B": b})
    df = pd.DataFrame(rows)
    a, b = df["A"].to_numpy(), df["B"].to_numpy()
    with np.errstate(all="ignore"):
        formulas = [{"id": f"f{i}", "expr": e, "y": finite_list(f(a, b))} for i, (e, f) in enumerate(FORMULAS)]

    # Normalisation (M-STAT-NORM): A relative to the mean of A over rows with cond = ctrl, within dose.
    norms = []
    for mode in ["ratio", "percent", "difference"]:
        for within in [[], ["dose"]]:
            out = []
            for _, r in df.iterrows():
                ref = df[df["cond"] == "ctrl"]
                for w in within:
                    ref = ref[ref[w] == r[w]]
                vals = ref["A"][np.isfinite(ref["A"])]
                m = math.fsum(vals) / len(vals) if len(vals) else float("nan")
                v = r["A"]
                out.append(v / m if mode == "ratio" else 100 * v / m if mode == "percent" else v - m)
            norms.append({"id": f"n_{mode}_{'_'.join(within) or 'all'}", "mode": mode, "within": within, "y": finite_list(out)})

    # Grouping (M-STAT-AGG) by cond and dose, with pandas.
    groups = []
    for (cond, dose), g in df.groupby(["cond", "dose"], sort=True):
        groups.append(
            {
                "cond": cond,
                "dose": int(dose),
                "rows": len(g),
                "A": summary(list(g["A"])),
                "B": summary(list(g["B"])),
                "pandas": {
                    "A_mean": fin(g["A"].mean()),
                    "A_std": fin(g["A"].std(ddof=1)),
                    "A_sem": fin(g["A"].sem(ddof=1)),
                    "A_median": fin(g["A"].median()),
                    "B_mean": fin(g["B"].mean()),
                    "B_std": fin(g["B"].std(ddof=1)),
                },
            }
        )
    write(
        "table_pipeline.json",
        {
            "rows": [{**r, "A": fin(r["A"]), "B": fin(r["B"])} for r in rows],
            "formulas": formulas,
            "normalize": norms,
            "groups": groups,
        },
    )


# ---------------------------------------------------------------------------
# Inverse transforms; binning, smoothing and contour levels
# ---------------------------------------------------------------------------


def golden_transforms_inverse():
    ys = np.concatenate([np.linspace(-0.2, 1.2, 57), [0.0, 1.0, 0.5]])
    cases = []
    params = [
        ("logicle", {"T": 262144, "W": 0.5, "M": 4.5, "A": 0}),
        ("logicle", {"T": 10000, "W": 1.0, "M": 4.5, "A": 1.0}),
        ("logicle", {"T": 1000, "W": 0.0, "M": 4.0, "A": 0.0}),
        ("logicle", {"T": 262144, "W": 1.5, "M": 4.5, "A": -1.0}),
        ("hyperlog", {"T": 262144, "W": 0.5, "M": 4.5, "A": 0}),
        ("hyperlog", {"T": 10000, "W": 1.0, "M": 4.5, "A": 1.0}),
        ("fasinh", {"T": 262144, "M": 4.5, "A": 0}),
        ("fasinh", {"T": 10000, "M": 5, "A": 1}),
        ("flin", {"T": 262144, "A": 0}),
        ("flin", {"T": 1000, "A": 100}),
        ("flog", {"T": 262144, "M": 4.5}),
        ("flog", {"T": 10000, "M": 5}),
    ]
    for kind, p in params:
        t = fk_transform({"kind": kind, **p})
        with np.errstate(all="ignore"):
            x = t.inverse(ys.reshape(-1, 1)).ravel()
        cases.append({"kind": kind, "params": p, "y": finite_list(ys), "x": finite_list(x)})
    write("transforms_inverse.json", cases)


def bin_edges_hist(x: np.ndarray, rng_: tuple[float, float], bins: int):
    """Flowmeris binning (M-PLOT-BIN) with numpy.histogram: off-scale values piled on the edge bins,
    NaN on bin 0, both counted."""
    lo, hi = rng_
    nan = np.isnan(x)
    v = x[~nan]
    off = int(((v < lo) | (v >= hi)).sum())
    counts, _ = np.histogram(np.clip(v, lo, hi), bins=bins, range=rng_)
    # numpy's last bin is closed: values at exactly `hi` are already in it, as Flowmeris piles them.
    counts = counts.astype(float)
    counts[0] += nan.sum()
    return counts, off, int(nan.sum())


def golden_density():
    rng = np.random.default_rng(1234)
    n = 3000
    x = np.concatenate([rng.normal(0.45, 0.12, n - 300), rng.uniform(-0.3, 1.3, 300)])
    y = 0.6 * x + rng.normal(0.2, 0.08, n)
    # Values exactly on bin edges and on the range ends, and NaN.
    xr, yr, bins = (0.0, 1.0), (0.1, 0.9), 64
    edges = np.linspace(xr[0], xr[1], bins + 1)
    x[: bins + 1] = edges
    x[bins + 1 : bins + 11] = np.nan
    y[bins + 20 : bins + 25] = np.nan
    y[bins + 30 : bins + 35] = yr[1]
    h, off, nan = bin_edges_hist(x, xr, bins)
    # 2D: rows = y bins (row 0 lowest), columns = x bins.
    nx, ny = 48, 40
    xn, yn = np.isnan(x), np.isnan(y)
    cx = np.where(xn, xr[0], np.clip(x, xr[0], xr[1]))
    cy = np.where(yn, yr[0], np.clip(y, yr[0], yr[1]))
    h2, _, _ = np.histogram2d(cy, cx, bins=[ny, nx], range=[yr, xr])
    off2 = int((((~xn) & ((x < xr[0]) | (x >= xr[1]))) | ((~yn) & ((y < yr[0]) | (y >= yr[1])))).sum())
    nan2 = int((xn | yn).sum())
    smooth1, smooth2 = [], []
    for sigma in [0.5, 1.0, 2.0, 3.7]:
        r = max(1, math.ceil(4 * sigma))
        smooth1.append({"sigma": sigma, "y": list(map(float, ndimage.gaussian_filter1d(h, sigma, mode="constant", cval=0.0, radius=r)))})
        smooth2.append({"sigma": sigma, "values": list(map(float, ndimage.gaussian_filter(h2, sigma, mode="constant", cval=0.0, radius=r).ravel()))})
    # Histogram heights: smoothed (σ = 1.5 bins) then normalised.
    hs = ndimage.gaussian_filter1d(h, 1.5, mode="constant", cval=0.0, radius=6)
    norm = {"count": list(map(float, hs)), "mode": list(map(float, hs / hs.max())), "area": list(map(float, hs / math.fsum(hs)))}
    # Contour levels on the smoothed 2D grid (σ = 2), by the documented definitions.
    g = ndimage.gaussian_filter(h2, 2.0, mode="constant", cval=0.0, radius=8).ravel()
    pos = np.sort(g[g > 0])
    total = math.fsum(pos)

    def levels(targets):
        out, cum, t = [], 0.0, 0
        targets = sorted(targets)
        for v in pos[::-1]:
            if t >= len(targets):
                break
            cum += v
            while t < len(targets) and cum >= targets[t]:
                out.append(float(v))
                t += 1
        return sorted(set(out))

    eqp = {str(p): levels([i * p * total for i in range(1, round(1 / p))]) for p in [0.1, 0.05, 0.2]}
    logl = {str(k): levels([0.98 * 0.5**i * total for i in range(k)]) for k in [3, 5, 8]}
    valid = x[~np.isnan(x)]
    scott = float(np.std(valid, ddof=1) * valid.size ** (-1 / 6) * bins / (xr[1] - xr[0]))
    write(
        "density.json",
        {
            "x": finite_list(x),
            "y": finite_list(y),
            "hist": {"range": list(xr), "bins": bins, "counts": list(map(float, h)), "off_scale": off, "nan": nan},
            "hist2d": {"x_range": list(xr), "y_range": list(yr), "nx": nx, "ny": ny, "values": list(map(float, h2.ravel())), "off_scale": off2, "nan": nan2},
            "smooth1d": smooth1,
            "smooth2d": smooth2,
            "hist_norm": {"sigma": 1.5, **norm},
            "levels_eqp": eqp,
            "levels_log": logl,
            "scott_sigma_bins": scott,
        },
    )


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    golden_fcs()
    golden_comp_csv()
    golden_comp_spill_8color()
    golden_transforms()
    golden_stats()
    golden_scenarios()
    golden_stats_edge()
    golden_aggregate()
    golden_table()
    golden_transforms_inverse()
    golden_density()
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "python": sys.version,
        "platform": platform.platform(),
        "flowkit": fk.__version__,
        "flowio": flowio.__version__,
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "pandas": pd.__version__,
    }
    (OUT / "golden-manifest.json").write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
