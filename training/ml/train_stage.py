"""Train and test the stage-forecast model.

Model: cumulative (ordinal) logistic regression built from two L2-regularized
logistic models: P(reach Series B or later) and P(reach Series C or later).
Stage probabilities: P(A only) = 1 - P(>=B); P(B) = P(>=B) - P(>=C); P(C+) = P(>=C).

Testing is chronological: the model is trained on earlier Series A years and
scored on later years it never saw. Compared against two baselines:
  1. base rate (every company gets the training-period average)
  2. Series A round size alone (bigger round = higher rank)

Usage: .venv/bin/python ml/train_stage.py
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, average_precision_score, brier_score_loss

ROOT = Path(__file__).resolve().parents[1]
DF = pd.read_csv(ROOT / "ml" / "dataset.csv", parse_dates=["a_date"])
RNG = np.random.default_rng(42)
CATS = ["B2B software", "B2C software", "Hardware", "Other"]

CORE = ["log_a_size", "log_prior_equity", "months_to_a", "age_years"]
EXTENDED = CORE + ["log_investors", "hub_state", "prior_rounds"] + [f"cat_{c}" for c in CATS[1:]]


class Prep:
    """Transforms, median imputation with missing flags, standardization. Fit on train only."""

    def __init__(self, feats):
        self.feats = feats

    @staticmethod
    def raw(d):
        x = pd.DataFrame(index=d.index)
        x["log_a_size"] = np.log10(d.a_size_usd)
        x["log_prior_equity"] = np.log10(1 + d.prior_equity_usd)
        x["months_to_a"] = d.months_first_funding_to_a.clip(upper=120)
        x["age_years"] = (d.age_months_at_a / 12).clip(upper=20)
        x["log_investors"] = np.log2(d.a_investors)
        x["hub_state"] = d.hub_state
        x["prior_rounds"] = d.prior_rounds.clip(upper=5)
        for c in CATS[1:]:
            x[f"cat_{c}"] = (d.category == c).astype(float)
        return x

    def fit(self, d):
        x = self.raw(d)[self.feats]
        self.med = x.median()
        self.miss_cols = [c for c in self.feats if x[c].isna().any()]
        z = self._fill(x)
        self.mu, self.sd = z.mean(), z.std().replace(0, 1)
        return self

    def _fill(self, x):
        z = x.fillna(self.med)
        for c in self.miss_cols:
            z[f"{c}_missing"] = x[c].isna().astype(float)
        return z

    def transform(self, d):
        z = self._fill(self.raw(d)[self.feats])
        return ((z - self.mu) / self.sd).values

    def columns(self):
        return list(self.mu.index)


def fit_cumulative(train, horizon, feats, C):
    prep = Prep(feats).fit(train)
    X, y = prep.transform(train), train[f"stage_{horizon}y"].values
    models = [LogisticRegression(C=C, max_iter=2000).fit(X, (y >= k).astype(int)) for k in (1, 2)]
    return prep, models


def predict(prep, models, d):
    X = prep.transform(d)
    p_b = models[0].predict_proba(X)[:, 1]
    p_c = np.minimum(models[1].predict_proba(X)[:, 1], p_b)  # keep P(>=C) <= P(>=B)
    return p_b, p_c


def rps(p_b, p_c, y):
    """Ranked probability score for 3 ordered outcomes (lower is better)."""
    return np.mean((p_b - (y >= 1)) ** 2 + (p_c - (y >= 2)) ** 2) / 2


def metrics(score, y_bin):
    base = y_bin.mean()
    order = np.argsort(-score)
    top20pct = order[: max(1, len(order) // 5)]
    return {
        "AUC": roc_auc_score(y_bin, score),
        "AvgPrecision": average_precision_score(y_bin, score),
        "Top20%_hit_rate": y_bin[top20pct].mean(),
        "Top20%_lift": y_bin[top20pct].mean() / base,
        "Top20_hits": int(y_bin[order[:20]].sum()),
        "base_rate": base,
    }


def boot_ci(fn, n, B=1000):
    vals = [fn(RNG.integers(0, n, n)) for _ in range(B)]
    return np.percentile(vals, [2.5, 97.5])


def tune_C(train, horizon, feats):
    """Pick regularization strength using the last training year as validation."""
    last = train.year.max()
    tr, va = train[train.year < last], train[train.year == last]
    best = None
    for C in [0.01, 0.03, 0.1, 0.3, 1.0]:
        p_b, p_c = predict(*fit_cumulative(tr, horizon, feats, C), va)
        s = rps(p_b, p_c, va[f"stage_{horizon}y"].values)
        if best is None or s < best[1]:
            best = (C, s)
    return best[0]


def evaluate(horizon, train_years, test_years, label):
    col = f"stage_{horizon}y"
    d = DF[DF[col].notna()]
    train, test = d[d.year.isin(train_years)], d[d.year.isin(test_years)]
    y = test[col].values.astype(int)
    out = {"setup": label, "horizon_years": horizon, "train_n": len(train), "test_n": len(test),
           "train_years": f"{min(train_years)}-{max(train_years)}", "test_years": f"{min(test_years)}-{max(test_years)}",
           "test_outcomes": {"stayed_A": int((y == 0).sum()), "reached_B": int((y == 1).sum()), "reached_C+": int((y == 2).sum())}}

    # baselines
    tb = train[col].values
    base_b, base_c = (tb >= 1).mean(), (tb >= 2).mean()
    size = np.log10(test.a_size_usd.fillna(train.a_size_usd.median())).values
    out["rps_base_rate"] = rps(np.full(len(y), base_b), np.full(len(y), base_c), y)

    results = {}
    for name, feats in [("core4", CORE), ("extended", EXTENDED)]:
        C = tune_C(train, horizon, feats)
        prep, models = fit_cumulative(train, horizon, feats, C)
        p_b, p_c = predict(prep, models, test)
        r = {"C": C, "rps": rps(p_b, p_c, y)}
        r["rps_skill_vs_base"] = 1 - r["rps"] / out["rps_base_rate"]
        for k, p in [(">=B", p_b), (">=C", p_c)]:
            yb = (y >= (1 if k == ">=B" else 2)).astype(int)
            m = metrics(p, yb)
            m["Brier"] = brier_score_loss(yb, p)
            m["Brier_base"] = brier_score_loss(yb, np.full(len(yb), base_b if k == ">=B" else base_c))
            ci = boot_ci(lambda i: roc_auc_score(yb[i], p[i]) - roc_auc_score(yb[i], size[i]), len(yb))
            m["AUC_gain_vs_roundsize_95CI"] = [round(v, 3) for v in ci]
            m["AUC_95CI"] = [round(v, 3) for v in boot_ci(lambda i: roc_auc_score(yb[i], p[i]), len(yb))]
            r[k] = m
        r["coefficients"] = {k: {c: round(w, 3) for c, w in zip(prep.columns(), mdl.coef_[0])}
                             for k, mdl in zip([">=B", ">=C"], models)}
        # calibration table for P(>=B), deciles collapsed to 5 bins
        bins = pd.qcut(p_b, 5, labels=False, duplicates="drop")
        r["calibration_>=B"] = [{"predicted": round(p_b[bins == b].mean(), 3), "actual": round((y[bins == b] >= 1).mean(), 3), "n": int((bins == b).sum())} for b in np.unique(bins)]
        # per-category AUC for >=B
        r["per_category_AUC_>=B"] = {}
        for c in CATS:
            m_ = (test.category == c).values
            if m_.sum() >= 30 and len(np.unique(y[m_] >= 1)) == 2:
                r["per_category_AUC_>=B"][c] = {"n": int(m_.sum()), "AUC": round(roc_auc_score(y[m_] >= 1, p_b[m_]), 3)}
        results[name] = r

    for k in (">=B", ">=C"):
        yb = (y >= (1 if k == ">=B" else 2)).astype(int)
        out[f"roundsize_baseline_{k}"] = metrics(size, yb)
    out["models"] = results
    return out


def rolling(horizon, years):
    """Train on all years before Y, test on Y. Checks stability across vintages."""
    rows = []
    col = f"stage_{horizon}y"
    for Y in years:
        d = DF[DF[col].notna()]
        train, test = d[d.year < Y], d[d.year == Y]
        prep, models = fit_cumulative(train, horizon, EXTENDED, tune_C(train, horizon, EXTENDED))
        p_b, _ = predict(prep, models, test)
        yb = (test[col].values >= 1).astype(int)
        size = np.log10(test.a_size_usd.fillna(train.a_size_usd.median())).values
        rows.append({"test_year": Y, "n": len(test), "base_rate_>=B": round(yb.mean(), 3),
                     "AUC_model": round(roc_auc_score(yb, p_b), 3), "AUC_roundsize": round(roc_auc_score(yb, size), 3)})
    return rows


def export_final(horizon, years):
    """Refit on all observable years for later use in the app."""
    col = f"stage_{horizon}y"
    d = DF[DF[col].notna() & DF.year.isin(years)]
    C = tune_C(d, horizon, EXTENDED)
    prep, models = fit_cumulative(d, horizon, EXTENDED, C)
    return {"horizon_years": horizon, "trained_on": f"Series A {min(years)}-{max(years)}, n={len(d)}", "C": C,
            "features": EXTENDED, "columns": prep.columns(),
            "impute_median": prep.med.round(4).to_dict(), "missing_flag_cols": prep.miss_cols,
            "mean": prep.mu.round(6).to_dict(), "std": prep.sd.round(6).to_dict(),
            "models": {k: {"intercept": float(m.intercept_[0]), "coef": m.coef_[0].round(6).tolist()}
                       for k, m in zip([">=B", ">=C"], models)}}


def r3(o):
    if isinstance(o, dict):
        return {k: r3(v) for k, v in o.items()}
    if isinstance(o, list):
        return [r3(v) for v in o]
    if isinstance(o, (float, np.floating)):
        return round(float(o), 4)
    return o


if __name__ == "__main__":
    report = {
        "primary_3y": evaluate(3, range(2005, 2009), range(2009, 2011), "3-year horizon: train 2005-2008, test 2009-2010"),
        "secondary_5y": evaluate(5, range(2005, 2008), [2008], "5-year horizon: train 2005-2007, test 2008"),
        "rolling_3y": rolling(3, [2008, 2009, 2010]),
    }
    report = r3(report)
    (ROOT / "ml" / "results_stage.json").write_text(json.dumps(report, indent=2))
    (ROOT / "ml" / "model_stage_3y.json").write_text(json.dumps(r3(export_final(3, range(2005, 2011))), indent=2))
    (ROOT / "ml" / "model_stage_5y.json").write_text(json.dumps(r3(export_final(5, range(2005, 2009))), indent=2))

    for key in ("primary_3y", "secondary_5y"):
        r = report[key]
        print(f"\n=== {r['setup']}  (train n={r['train_n']}, test n={r['test_n']}) outcomes={r['test_outcomes']}")
        print(f"RPS base rate {r['rps_base_rate']}")
        for k in (">=B", ">=C"):
            rs = r[f"roundsize_baseline_{k}"]
            print(f"  {k}: base rate {rs['base_rate']:.3f} | round-size AUC {rs['AUC']:.3f} AP {rs['AvgPrecision']:.3f} top20% lift {rs['Top20%_lift']:.2f}")
            for name, m in r["models"].items():
                mm = m[k]
                print(f"      {name:8s} AUC {mm['AUC']:.3f} {mm['AUC_95CI']} AP {mm['AvgPrecision']:.3f} top20% lift {mm['Top20%_lift']:.2f} "
                      f"top20 hits {mm['Top20_hits']}/20 Brier {mm['Brier']:.4f} vs base {mm['Brier_base']:.4f} | AUC gain vs size {mm['AUC_gain_vs_roundsize_95CI']}")
        for name, m in r["models"].items():
            print(f"  {name}: RPS {m['rps']} (skill vs base {m['rps_skill_vs_base']:+.3f}), per-category AUC {m['per_category_AUC_>=B']}")
    print("\nrolling 3y:", report["rolling_3y"])
    print("\ncalibration (3y, extended, P>=B):", report["primary_3y"]["models"]["extended"]["calibration_>=B"])
    print("coefficients (3y extended):", json.dumps(report["primary_3y"]["models"]["extended"]["coefficients"]))
