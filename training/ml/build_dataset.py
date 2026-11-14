"""Build the Series A modeling table from the Crunchbase 2013 snapshot.

One row per U.S. company at its first Series A (2005-2013). Features use only
rounds dated BEFORE the Series A date. Outcomes look forward 3 and 5 years.
The snapshot ends Dec 2013, so a 3-year outcome is fully observable for Series A
through 2010 and a 5-year outcome through 2008.

Usage: .venv/bin/python ml/build_dataset.py
"""
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "crunchbase2013"
OUT = ROOT / "ml" / "dataset.csv"
SNAPSHOT_END = pd.Timestamp("2013-12-12")

# Crunchbase category_code -> pilot category (judgment call, documented in report)
CATEGORY = {
    "B2B software": ["software", "enterprise", "analytics", "advertising", "security",
                     "network_hosting", "finance", "public_relations", "consulting", "legal",
                     "government"],
    "B2C software": ["web", "mobile", "games_video", "ecommerce", "social", "search",
                     "messaging", "education", "news", "music", "travel", "photo_video",
                     "fashion", "hospitality", "real_estate", "sports", "pets", "design", "local"],
    "Hardware": ["hardware", "semiconductor", "manufacturing", "automotive", "nanotech"],
}
CAT_MAP = {code: cat for cat, codes in CATEGORY.items() for code in codes}
EQUITY = ["angel", "series-a", "venture", "crowdfunding", "other"]


def main():
    fr = pd.read_csv(DATA / "funding_rounds.csv", parse_dates=["funded_at", "created_at"])
    fr = fr[fr.funded_at.notna()]
    obj = pd.read_csv(DATA / "objects.csv", low_memory=False, usecols=[
        "id", "entity_type", "name", "category_code", "status", "founded_at",
        "country_code", "state_code"])
    obj = obj[(obj.entity_type == "Company") & (obj.country_code == "USA")]
    acq = pd.read_csv(DATA / "acquisitions.csv", parse_dates=["acquired_at"])
    ipo = pd.read_csv(DATA / "ipos.csv", parse_dates=["public_at"])

    # first Series A per company
    a = (fr[fr.funding_round_type == "series-a"].sort_values("funded_at")
         .groupby("object_id").first().reset_index())
    a = a.merge(obj, left_on="object_id", right_on="id", how="inner")
    a = a[(a.funded_at >= "2005-01-01") & (a.funded_at <= "2013-12-31")].copy()
    a = a.rename(columns={"funded_at": "a_date"})
    # drop companies that were already public (their "Series A" is a post-IPO financing)
    lab = ROOT / "labels" / "labels_unmatched.csv"
    if lab.exists():
        l = pd.read_csv(lab)
        a = a[~a.object_id.isin(l[l.label == "wrong_match"].object_id)]

    # ---- features (only information dated before the Series A)
    before = fr.merge(a[["object_id", "a_date"]], on="object_id")
    before = before[before.funded_at < before.a_date]
    eq = before[before.funding_round_type.isin(EQUITY)]
    first_round = fr.groupby("object_id").funded_at.min()

    a["a_size_usd"] = a.raised_amount_usd.where(a.raised_amount_usd > 0)
    a["prior_equity_usd"] = a.object_id.map(eq.groupby("object_id").raised_amount_usd.sum()).fillna(0)
    a["prior_rounds"] = a.object_id.map(eq.groupby("object_id").size()).fillna(0)
    a["months_first_funding_to_a"] = ((a.a_date - a.object_id.map(first_round)).dt.days / 30.44).clip(lower=0)
    founded = pd.to_datetime(a.founded_at, errors="coerce")
    a["age_months_at_a"] = ((a.a_date - founded).dt.days / 30.44)
    a.loc[a.age_months_at_a < 0, "age_months_at_a"] = np.nan  # founded after round = bad record
    a["a_investors"] = a.participants.where(a.participants > 0)
    a["hub_state"] = a.state_code.isin(["CA", "NY", "MA"]).astype(int)
    a["category"] = a.category_code.map(CAT_MAP).fillna("Other")
    a["year"] = a.a_date.dt.year

    # ---- outcomes: furthest stage reached within H years (0 = stayed A, 1 = B, 2 = C+)
    later = fr.merge(a[["object_id", "a_date"]], on="object_id")
    later = later[later.funded_at > later.a_date]
    for h in (3, 5):
        win = later[later.funded_at <= later.a_date + pd.DateOffset(years=h)]
        b = set(win[win.funding_round_type == "series-b"].object_id)
        c = set(win[win.funding_round_type == "series-c+"].object_id)
        stage = np.where(a.object_id.isin(c), 2, np.where(a.object_id.isin(b), 1, 0))
        observable = a.a_date + pd.DateOffset(years=h) <= SNAPSHOT_END
        a[f"stage_{h}y"] = pd.Series(stage, index=a.index).where(observable)
        for name, t, col, dcol in [("acquired", acq, "acquired_object_id", "acquired_at"),
                                   ("ipo", ipo, "object_id", "public_at")]:
            t = t.merge(a[["object_id", "a_date"]], left_on=col, right_on="object_id", suffixes=("", "_a"))
            t = t[(t[dcol] > t.a_date) & (t[dcol] <= t.a_date + pd.DateOffset(years=h))]
            a[f"{name}_{h}y"] = a.object_id.isin(t[col]).astype(int).where(observable)

    cols = ["object_id", "name", "a_date", "year", "category_code", "category", "state_code", "status",
            "a_size_usd", "prior_equity_usd", "prior_rounds", "months_first_funding_to_a",
            "age_months_at_a", "a_investors", "hub_state",
            "stage_3y", "acquired_3y", "ipo_3y", "stage_5y", "acquired_5y", "ipo_5y"]
    a[cols].sort_values("a_date").to_csv(OUT, index=False)
    print(f"wrote {OUT} with {len(a)} companies")
    print(a.groupby("year").size().to_string())
    print("category:", a.category.value_counts().to_dict())
    print("stage_3y:", a.stage_3y.value_counts().sort_index().to_dict())
    print("stage_5y:", a.stage_5y.value_counts().sort_index().to_dict())
    print("missing %:", (a[["a_size_usd", "age_months_at_a", "a_investors"]].isna().mean() * 100).round(1).to_dict())


if __name__ == "__main__":
    main()
