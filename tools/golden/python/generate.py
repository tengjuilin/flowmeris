"""
Generate golden reference fixtures for flowmeris from FlowKit (Gating-ML 2.0 compliant) and NumPy.

Usage (from repo root):
    uv run --project tools/golden/python python tools/golden/python/generate.py

Outputs are written to fixtures/golden/. Every value is serialised with Python's repr (shortest
round-trip float formatting), so the TypeScript tests compare against exact IEEE-754 doubles.
"""

from __future__ import annotations

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

ROOT = Path(__file__).resolve().parents[3]
FIX = ROOT / "fixtures"
OUT = FIX / "golden"

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
]


def finite_list(a):
    return [None if not math.isfinite(float(v)) else float(v) for v in a]


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


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    golden_fcs()
    golden_comp_csv()
    golden_comp_spill_8color()
    golden_transforms()
    golden_stats()
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "python": sys.version,
        "platform": platform.platform(),
        "flowkit": fk.__version__,
        "flowio": flowio.__version__,
        "numpy": np.__version__,
    }
    (OUT / "golden-manifest.json").write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
