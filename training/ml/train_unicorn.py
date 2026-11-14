"""Train and test the unicorn-probability model.

Label: a documented PRIVATE round at >= $1B post-money within 5 years after the
first Series A (hand-verified dates in labels/). IPO/acquisition prices do not count.
Companies with unresolved labels or wrong name matches are excluded; companies
that were already >= $1B at Series A are ineligible.

Model: L2-penalized logistic regression on few inputs (few positives).
Uncertainty: 1,000 bootstrap refits -> 90% range for each company's probability.
Test: train on Series A 2005-2010, test on 2011-2013 (outcome windows end by 2018).

Usage: .venv/bin/python ml/train_unicorn.py
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, average_precision_score, brier_score_loss, log_loss
from train_stage import Prep, r3

ROOT = Path(__file__).resolve().parents[1]
RNG = np.random.default_rng(7)
FEATS = ["log_a_size", "log_prior_equity", "age_years", "log_investors", "hub_state",
         "cat_B2C software", "cat_Hardware", "cat_Other"]


def load():
    d = pd.read_csv(ROOT / "ml" / "dataset.csv", parse_dates=["a_date"])
    lm = pd.read_csv(ROOT / "labels" / "labels_matched.csv")
    # matched wrong_match = a different, real startup that shares a unicorn's name -> a negative
    lm.loc[lm.label == "wrong_match", ["label", "first_1b_date"]] = ["no_private_1b", None]
    lab = pd.concat([lm, pd.read_csv(ROOT / "labels" / "labels_unmatched.csv")])
    lab["first_1b_date"] = pd.to_datetime(lab.first_1b_date, errors="coerce")
    d = d.merge(lab[["object_id", "label", "first_1b_date"]], on="object_id", how="left")
    d["label"] = d.label.fillna("not_in_candidates")  # raised < $75M by 2013 and not on unicorn lists
    deadline = d.a_date + pd.DateOffset(years=5)
    d["status_label"] = "negative"
    d.loc[d.label.isin(["unresolved", "wrong_match"]), "status_label"] = "excluded"
    pos = d.label.eq("private_1b") & d.first_1b_date.notna()
    d.loc[pos & (d.first_1b_date <= d.a_date), "status_label"] = "ineligible"
    d.loc[pos & (d.first_1b_date > d.a_date) & (d.first_1b_date <= deadline), "status_label"] = "positive"
    d.loc[d.label.eq("private_1b") & d.first_1b_date.isna(), "status_label"] = "excluded"
    return d


def fit(train, C):
    prep = Prep(FEATS).fit(train)
    m = LogisticRegression(C=C, max_iter=3000, class_weight=None).fit(prep.transform(train), train.y)
    return prep, m


def main():
    d = load()
    print("label status:", d.status_label.value_counts().to_dict())
    d = d[d.status_label.isin(["positive", "negative"])].copy()
    d["y"] = (d.status_label == "positive").astype(int)
    print("positives by Series A year:", d.groupby("year").y.sum().to_dict())
    print("positives:", ", ".join(d[d.y == 1].sort_values("a_date").name))

    train, test = d[d.year <= 2010], d[d.year >= 2011]
    # tune C with rolling validation inside the training years only:
    # train on years < Y, predict Y, for Y = 2008, 2009, 2010; pick lowest pooled log loss
    best = None
    for C in [0.01, 0.03, 0.1, 0.3, 1.0]:
        ps, ys = [], []
        for Y in (2008, 2009, 2010):
            prep_v, m_v = fit(train[train.year < Y], C)
            va = train[train.year == Y]
            ps += list(m_v.predict_proba(prep_v.transform(va))[:, 1])
            ys += list(va.y)
        s = log_loss(ys, ps)
        print(f"  validation C={C}: log loss {s:.4f}, AUC {roc_auc_score(ys, ps):.3f}")
        best = (C, s) if best is None or s < best[1] else best
    C = best[0]
    prep, m = fit(train, C)
    p = m.predict_proba(prep.transform(test))[:, 1]
    size = np.log10(test.a_size_usd.fillna(train.a_size_usd.median())).values
    y = test.y.values
    base = train.y.mean()

    def topk(score, k):
        return int(y[np.argsort(-score)[:k]].sum())

    boot_auc = []
    for _ in range(1000):
        i = RNG.integers(0, len(y), len(y))
        if y[i].sum() > 0:
            boot_auc.append((roc_auc_score(y[i], p[i]), roc_auc_score(y[i], size[i])))
    boot_auc = np.array(boot_auc)
    res = {
        "train": {"years": "2005-2010", "n": len(train), "positives": int(train.y.sum())},
        "test": {"years": "2011-2013", "n": len(test), "positives": int(y.sum()), "base_rate": y.mean()},
        "C": C,
        "model": {"AUC": roc_auc_score(y, p), "AUC_90CI": np.percentile(boot_auc[:, 0], [5, 95]).tolist(),
                  "AvgPrecision": average_precision_score(y, p),
                  "top20_hits": topk(p, 20), "top50_hits": topk(p, 50), "top100_hits": topk(p, 100),
                  "Brier": brier_score_loss(y, p), "Brier_base": brier_score_loss(y, np.full(len(y), base))},
        "roundsize_baseline": {"AUC": roc_auc_score(y, size), "AvgPrecision": average_precision_score(y, size),
                               "top20_hits": topk(size, 20), "top50_hits": topk(size, 50), "top100_hits": topk(size, 100)},
        "AUC_gain_vs_roundsize_90CI": np.percentile(boot_auc[:, 0] - boot_auc[:, 1], [5, 95]).tolist(),
        "expected_top100_hits_by_chance": 100 * y.mean(),
        "coefficients": dict(zip(prep.columns(), m.coef_[0].round(3).tolist())),
        "test_top20": test.assign(p=p).sort_values("p", ascending=False).head(20)[["name", "year", "p", "y"]].to_dict("records"),
    }

    # final model on all years + bootstrap ensemble for per-company ranges
    prep_f, m_f = fit(d, C)
    boots = []
    for _ in range(1000):
        s = d.iloc[RNG.integers(0, len(d), len(d))]
        if s.y.sum() >= 3:
            pb, mb = fit(s, C)
            boots.append({"intercept": float(mb.intercept_[0]), "coef": mb.coef_[0].round(5).tolist(),
                          "mean": pb.mu.round(5).tolist(), "std": pb.sd.round(5).tolist(),
                          "impute_median": pb.med.round(4).to_dict(), "columns": pb.columns(),
                          "missing_flag_cols": pb.miss_cols})
    model = {"label": "documented private round >= $1B within 5 years of first Series A",
             "trained_on": f"U.S. first Series A 2005-2013, n={len(d)}, positives={int(d.y.sum())}",
             "base_rate": d.y.mean(), "C": C, "features": FEATS, "columns": prep_f.columns(),
             "impute_median": prep_f.med.round(4).to_dict(), "missing_flag_cols": prep_f.miss_cols,
             "mean": prep_f.mu.round(6).to_dict(), "std": prep_f.sd.round(6).to_dict(),
             "intercept": float(m_f.intercept_[0]), "coef": m_f.coef_[0].round(6).tolist(),
             "bootstrap_models": boots}
    (ROOT / "ml" / "model_unicorn.json").write_text(json.dumps(r3(model)))
    (ROOT / "ml" / "results_unicorn.json").write_text(json.dumps(r3(res), indent=2, default=str))
    print(json.dumps(r3({k: v for k, v in res.items() if k != "test_top20"}), indent=2))
    print("test top 20:", [(r["name"], round(r["p"], 3), r["y"]) for r in res["test_top20"]])


if __name__ == "__main__":
    main()
