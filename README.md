# Unicorn Radar

**See how a Series A company stacks up against 5,819 real startups — and what happened to the ones most like it.**

Unicorn Radar gives a VC analyst a second opinion in under a minute. Enter a company's Series A facts and you get:

- a forecast of its odds of raising a Series B or C,
- its odds of a $1B private round, shown as a range against the historical average,
- its position on a map of 5,819 real U.S. Series A companies from 2005–2013, including the thousands that never made it.

🏆 **Our entry for the GUX × Lovable Hackathon, built to take first place.** Sister project: [**Founder Radar**](https://github.com/liuyuze1012-code/founder-radar-setup) finds promising founders *before* they raise. Unicorn Radar judges companies *once* they have raised.

> Not investment advice. This is a research tool trained on public, historical data.

---

## The problem

A Series A partner sees hundreds of decks a year and invests in a handful. Comparisons are mostly made from memory: "this looks like early Airbnb." Memory has two flaws:

1. **Survivorship bias.** You remember the Airbnbs, not the 50 similar companies that died. Any comparison built only from famous winners will overrate everyone.
2. **No base rate.** "Strong round, good investors" means little until you know how often companies like that actually reach the next round.

Unicorn Radar compares every company with the **full historical cohort**, failures included, and reports outcomes as counts and ranges, not vibes.

## What it does

| Page | What you get |
|---|---|
| **Scorecard** (`/scorecard`) | Odds of reaching Series B / C+ within 3 and 5 years. Unicorn odds as a range and as a multiple of the base rate. A percentile, the inputs that moved the score, and the inputs you left blank. |
| **Comparables Map** (`/map`) | All 5,819 companies on one zoomable canvas, colored by what actually happened. Your company appears with its 25 nearest look-alikes, along with their real outcomes: how many stalled, how many reached B or C, and which became unicorns. |
| **Unicorn Lessons** (`/lessons`) | A close-up of the 5 historical unicorns most similar to your company at their Series A, and what they did next. |
| **Saved companies** (`/saved`) | Keep a list of companies you've scored. |

Every number comes from a deterministic model that runs in the browser (`src/lib/scoring.ts`). An LLM is used only for written stories on the Lessons page, never for a score.

## How the model works

### Data
- **Crunchbase 2013 snapshot** ([Kaggle](https://www.kaggle.com/datasets/justinas/startup-investments), CC BY 4.0): every U.S. company whose **first Series A** fell between 2005 and 2013, **5,819 companies** in total.
- **Unicorn labels:** we started from the CB Insights unicorn lists (current and former) plus every company that had raised $75M+ by 2013, then **hand-verified 355 candidates** against public reporting. That left **50 confirmed unicorns**. We also caught 12 wrong name matches and several wrong "date joined" values in the public lists. Files: `training/labels/`.

### Inputs (only what was known *at* the Series A, so no peeking into the future)
Series A size · equity raised before the A · number of prior rounds · months from first funding to A · company age · number of Series A investors · HQ in CA/NY/MA · category (B2B software, B2C software, hardware, other)

Engineering: log-scaled dollar amounts, capped outliers, median fill with "was missing" flags, and standardization fit **on training years only**.

### Models
| Question | Model | Why this model |
|---|---|---|
| Which stage will it reach? (A / B / C+) | **Ordinal logistic regression**, made of two L2-penalized logistic models for P(≥B) and P(≥C) | Stages are ordered. Each input has one readable weight. |
| Will it raise at $1B+ within 5 years? | **L2-penalized logistic regression**, with 500 bootstrap refits for uncertainty ranges | Only 50 positives, so heavy regularization is needed and a range is more honest than a point estimate |
| Who does it resemble? | **Nearest neighbors** on the same standardized inputs, within the same category | Similarity uses all inputs, never the 2D map position |

Gradient-boosted trees were tested as a challenger and scored within noise of the logistic models (0.64 vs 0.63 AUC). We kept the model you can explain.

### Results: tested on later years the model never saw

Training always uses earlier years, and testing uses later ones, the same way a VC would use it.

**Unicorn model:** trained on Series A 2005–2010, tested on 2011–2013 (2,731 companies, 26 unicorns)

| | Model | Round size alone | Random |
|---|---|---|---|
| AUC | **0.84** (90% CI 0.77–0.89) | 0.82 | 0.50 |
| Unicorns in top 100 picks | **8** | 5 | 1 |
| Unicorns in top 20 picks | **4** | 3 | 0.2 |

The top 20 test picks included Pinterest, Instacart, Wayfair and Formlabs.

**Stage model:** trained on 2005–2008, tested on 2009–2010 (985 companies)

| | Base rate | Round size AUC | Model AUC | Top-20% lift |
|---|---|---|---|---|
| Reaches Series B+ in 3 yrs | 41.6% | 0.56 | **0.63** | 1.42× |
| Reaches Series C+ in 3 yrs | 11.7% | 0.59 | **0.63** | 1.70× |
| Reaches Series C+ in 5 yrs | 18.2% | 0.55 | **0.69** | 2.05× |

### What it can't do yet (read this before trusting a number)
- **The unicorn model's edge over round size is small.** Most of the unicorn signal is "big round, many investors." The model's value is the ranking, the uncertainty range and the comparables, not a magic feature.
- **The data stops in 2013.** Today's rounds are bigger across the board, so a 2024 company will score high partly because of its era. Next fix: compare each company with others from the same year.
- **Missing data carries signal.** Better-documented companies did better, so part of the stage model's edge comes from documentation completeness. We measured this and report it in [`training/RESULTS.md`](training/RESULTS.md).
- **There are 26 test unicorns.** Every unicorn number has a wide range, which is why the app shows ranges.

## Roadmap: plug in a fund's own data
The pipeline is designed to retrain on proprietary data. With a VC's deal-flow history, we would add:
- founder background and team composition (and [Founder Radar](https://github.com/liuyuze1012-code/founder-radar-setup)'s signals),
- traction metrics: revenue growth, retention, hiring velocity (the signals least inflated by booms),
- investor quality and syndicate history,
- the fund's own pass/invest decisions, so the model learns *its* taste,
- multi-cycle data (2008, 2021, the AI wave), so era effects can be separated from intrinsic quality.

## Run it yourself: which API keys do you need?

**Short answer: none for the core product.** The Scorecard, the forecast and the Comparables Map run entirely in your browser from the model files in `src/model/`. Clone the repo, install, and run.

Two extra features need your **own** keys, because ours are not in this repo and never will be:

| Feature | Needs | Environment variable |
|---|---|---|
| Scorecard, forecast, Comparables Map | Nothing | none |
| Unicorn Lessons (AI-written stories) | An AI API key | `LOVABLE_API_KEY` (Lovable AI gateway). Or edit `src/lib/aiGateway.server.ts` to use your own Anthropic or OpenAI key. |
| Saved companies | A Supabase project | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (plus `VITE_` copies of both for the browser) and `SUPABASE_SERVICE_ROLE_KEY` (server only, never in the browser) |

**Easiest path:** open the project in [Lovable](https://lovable.dev) and remix it. Lovable Cloud creates the database and AI key for you automatically.

**Manual path:**

```bash
git clone https://github.com/liuyuze1012-code/Unicorn_Radar.git
cd Unicorn_Radar
bun install        # or: npm install
# Optional: put your own Supabase + AI keys in .env (see the table above)
bun run dev        # Vite prints the local URL
bun run test       # checks the TypeScript scorer matches the Python-trained weights
```

If no keys are set, the core pages still work. Only Lessons stories and Saved companies will show an error.

## Retrain the model

```bash
python -m venv training/.venv && source training/.venv/bin/activate
pip install -r training/requirements.txt
# Download the Crunchbase 2013 snapshot (Kaggle: justinas/startup-investments)
# and unzip funding_rounds.csv, objects.csv, acquisitions.csv, ipos.csv into training/data/crunchbase2013/
python training/ml/build_dataset.py   # -> training/ml/dataset.csv
python training/ml/train_stage.py     # stage model + results_stage.json
python training/ml/train_unicorn.py   # unicorn model + results_unicorn.json
python training/ml/export_web.py      # writes the weights the app uses into src/model/
```

Rebuilding from raw data reproduces the shipped model exactly. Full write-up: [`training/RESULTS.md`](training/RESULTS.md).

## Project structure

```
src/
  lib/scoring.ts        # the model, ported to TypeScript (deterministic)
  lib/comparables.ts    # nearest-neighbor search over the 5,819 companies
  model/*.json          # exported weights, bootstraps, company table
  routes/               # Home, Scorecard, Map, Lessons, Saved
  components/map/       # canvas + d3-zoom Comparables Map
training/
  ml/                   # Python: dataset build, training, export
  labels/               # hand-verified unicorn labels with sources
  RESULTS.md            # full evaluation, including what didn't work
```

**Stack:** TanStack Start (React + TypeScript), Vite, Tailwind, d3-zoom, Vitest · Python, pandas, scikit-learn · built and hosted with [Lovable](https://lovable.dev).

## Data & license
- Code: [MIT](LICENSE).
- Company data: Crunchbase 2013 snapshot via Kaggle (CC BY 4.0). Derived files in `src/model/` and `training/ml/dataset.csv` keep that attribution.
- Unicorn lists: CB Insights via Kaggle (CC0). Labels were re-verified by hand from public reporting.
- No third-party logos are used.

## Team
Built by **Gavin (Yuze) Liu** and **Leon Yan** at Georgetown University for the GUX × Lovable Hackathon, with Claude and Lovable. Issues and PRs are welcome.
