"""Export the trained models as compact JSON for the web app, plus test fixtures.

Writes into ../src/model/ (the web app):
  stage_3y.json, stage_5y.json, unicorn.json  - model weights + preprocessing
  reference.json                               - base rates + historical score percentiles
  fixtures.json                                - sample companies with Python scores (for TS tests)

Usage: python training/ml/export_web.py
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd
import train_stage as ts
import train_unicorn as tu

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / "src" / "model"
OUT.mkdir(parents=True, exist_ok=True)
VERSION = "2026-11-13.1"
N_BOOT = 500


def prep_dict(prep):
    return {"features": prep.feats, "columns": prep.columns(),
            "impute_median": {k: round(float(v), 6) for k, v in prep.med.items()},
            "missing_flag_cols": prep.miss_cols,
            "mean": [round(float(v), 6) for v in prep.mu.values],
            "std": [round(float(v), 6) for v in prep.sd.values]}


def stage_model(h, years):
    d = ts.DF[ts.DF[f"stage_{h}y"].notna() & ts.DF.year.isin(years)]
    C = ts.tune_C(d, h, ts.EXTENDED)
    prep, models = ts.fit_cumulative(d, h, ts.EXTENDED, C)
    y = d[f"stage_{h}y"]
    return d, prep, models, {
        "version": VERSION, "horizon_years": h, "trained_on": f"U.S. first Series A {min(years)}-{max(years)}, n={len(d)}",
        "C": C, "prep": prep_dict(prep),
        "reach_b": {"intercept": round(float(models[0].intercept_[0]), 6), "coef": models[0].coef_[0].round(6).tolist()},
        "reach_c": {"intercept": round(float(models[1].intercept_[0]), 6), "coef": models[1].coef_[0].round(6).tolist()},
        "base_rates": {"stay_a": round(float((y == 0).mean()), 4), "reach_b": round(float((y == 1).mean()), 4),
                       "reach_c": round(float((y == 2).mean()), 4)},
    }


def main():
    d3, prep3, m3, j3 = stage_model(3, range(2005, 2011))
    d5, prep5, m5, j5 = stage_model(5, range(2005, 2009))

    # unicorn: final model + bootstrap ensemble, all on the same labeled set
    lab = tu.load()
    lab = lab[lab.status_label.isin(["positive", "negative"])].copy()
    lab["y"] = (lab.status_label == "positive").astype(int)
    C = json.loads((ROOT / "ml" / "results_unicorn.json").read_text())["C"]
    prep_u, mu = tu.fit(lab, C)
    rng = np.random.default_rng(11)
    boots = []
    while len(boots) < N_BOOT:
        s = lab.iloc[rng.integers(0, len(lab), len(lab))]
        if s.y.sum() < 3:
            continue
        pb, mb = tu.fit(s, C)
        if pb.columns() != prep_u.columns():
            continue
        boots.append({"intercept": round(float(mb.intercept_[0]), 5), "coef": mb.coef_[0].round(5).tolist(),
                      "median": [round(float(pb.med[f]), 5) for f in prep_u.feats],
                      "mean": pb.mu.round(5).tolist(), "std": pb.sd.round(5).tolist()})
    ju = {"version": VERSION, "label": "documented private round >= $1B within 5 years of first Series A",
          "trained_on": f"U.S. first Series A 2005-2013, n={len(lab)}, unicorns={int(lab.y.sum())}",
          "C": C, "base_rate": round(float(lab.y.mean()), 5), "prep": prep_dict(prep_u),
          "intercept": round(float(mu.intercept_[0]), 6), "coef": mu.coef_[0].round(6).tolist(),
          "bootstrap": boots}

    # historical reference: percentiles of model scores per category (for "ranks above X%")
    def pct(arr):
        return np.percentile(arr, np.arange(0, 101)).round(6).tolist()
    pb3 = m3[0].predict_proba(prep3.transform(d3))[:, 1]
    pu = mu.predict_proba(prep_u.transform(lab))[:, 1]
    ref = {"version": VERSION, "stage_3y_reach_b": {}, "unicorn": {}}
    for c in ts.CATS + ["All"]:
        m = np.ones(len(d3), bool) if c == "All" else (d3.category == c).values
        ref["stage_3y_reach_b"][c] = {"n": int(m.sum()), "percentiles": pct(pb3[m])}
        m = np.ones(len(lab), bool) if c == "All" else (lab.category == c).values
        ref["unicorn"][c] = {"n": int(m.sum()), "unicorns": int(lab.y[m].sum()), "percentiles": pct(pu[m])}

    # fixtures: 40 real companies with Python scores, to check the TS port exactly
    sample = lab.sample(40, random_state=3)
    Xs3, Xs5, Xu = prep3.transform(sample), prep5.transform(sample), prep_u.transform(sample)
    fixtures = []
    for i, (_, r) in enumerate(sample.iterrows()):
        num = lambda v: None if pd.isna(v) else float(v)
        fixtures.append({
            "name": r["name"],
            "input": {"category": r.category, "seriesAAmountUsd": num(r.a_size_usd),
                      "priorEquityUsd": num(r.prior_equity_usd), "priorRounds": num(r.prior_rounds),
                      "monthsFirstFundingToA": num(r.months_first_funding_to_a),
                      "ageMonthsAtA": num(r.age_months_at_a), "seriesAInvestorCount": num(r.a_investors),
                      "hqState": None if pd.isna(r.state_code) else r.state_code},
            "expected": {
                "stage3y": {"reachB": float(m3[0].predict_proba(Xs3[i:i + 1])[0, 1]), "reachC": float(min(m3[1].predict_proba(Xs3[i:i + 1])[0, 1], m3[0].predict_proba(Xs3[i:i + 1])[0, 1]))},
                "stage5y": {"reachB": float(m5[0].predict_proba(Xs5[i:i + 1])[0, 1]), "reachC": float(min(m5[1].predict_proba(Xs5[i:i + 1])[0, 1], m5[0].predict_proba(Xs5[i:i + 1])[0, 1]))},
                "unicorn": float(mu.predict_proba(Xu[i:i + 1])[0, 1])},
        })

    # historical companies for the comparables map (all 5,819, scored with the final models)
    allc = tu.load()  # every company + its unicorn label status
    s3 = m3[0].predict_proba(prep3.transform(allc))[:, 1]
    su = mu.predict_proba(prep_u.transform(allc))[:, 1]
    deadline = allc.a_date + pd.DateOffset(years=5)

    def uni_status(r, dl):
        if r.status_label == "positive":
            return "within_5y"
        if r.status_label == "ineligible":
            return "before_series_a"
        if r.status_label == "excluded":
            return "unknown"
        if r.label == "private_1b" and pd.notna(r.first_1b_date) and r.first_1b_date > dl:
            return "later"
        return "no"

    def nz(v, nd=None):
        if pd.isna(v):
            return None
        return round(float(v), nd) if nd is not None else float(v)

    cols = ["name", "seriesADate", "year", "category", "hqState",
            "seriesAAmountUsd", "priorEquityUsd", "priorRounds", "monthsFirstFundingToA", "ageMonthsAtA",
            "seriesAInvestorCount", "stage3y", "stage5y", "unicorn", "firstBillionDate", "status2013",
            "stageScore", "unicornScore"]
    rows = []
    for i, (_, r) in enumerate(allc.iterrows()):
        rows.append([r["name"], r.a_date.strftime("%Y-%m"), int(r.year), r.category,
                     None if pd.isna(r.state_code) else r.state_code,
                     nz(r.a_size_usd, 0), nz(r.prior_equity_usd, 0), nz(r.prior_rounds),
                     nz(r.months_first_funding_to_a, 3), nz(r.age_months_at_a, 3), nz(r.a_investors),
                     None if pd.isna(r.stage_3y) else int(r.stage_3y), None if pd.isna(r.stage_5y) else int(r.stage_5y),
                     uni_status(r, deadline.iloc[i]),
                     None if pd.isna(r.first_1b_date) else r.first_1b_date.strftime("%Y-%m"),
                     r.status, round(float(s3[i]), 5), round(float(su[i]), 5)])
    companies = {"version": VERSION,
                 "source": "Crunchbase 2013 snapshot (CC BY 4.0, via Kaggle justinas/startup-investments); unicorn dates hand-verified",
                 "columns": cols, "rows": rows}

    for name, obj in [("stage_3y", j3), ("stage_5y", j5), ("unicorn", ju), ("reference", ref), ("fixtures", fixtures),
                      ("companies", companies)]:
        (OUT / f"{name}.json").write_text(json.dumps(obj, separators=(",", ":")))
        print(f"wrote {name}.json ({(OUT / f'{name}.json').stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
