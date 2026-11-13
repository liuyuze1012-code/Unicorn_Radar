import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CATEGORIES, scoreCompany, type Category, type CompanyInput } from "@/lib/scoring";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Unicorn Radar · Series A Scorecard" },
      { name: "description", content: "Score a Series A company against 5,819 historical U.S. companies: odds of Series B, C and a $1B round." },
      { property: "og:title", content: "Unicorn Radar · Series A Scorecard" },
      { property: "og:description", content: "Score a Series A company against 5,819 historical U.S. companies." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Form = { name: string; cat: Category; a: string; pe: string; pr: string; m: string; age: string; inv: string; st: string };
const toNum = (s: string, mult = 1) => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s) * mult);
const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

function Index() {
  const [f, setF] = useState<Form>({ name: "Your company", cat: "B2B software", a: "5", pe: "1", pr: "1", m: "12", age: "24", inv: "3", st: "CA" });
  const input: CompanyInput = useMemo(() => ({
    category: f.cat,
    seriesAAmountUsd: toNum(f.a, 1e6),
    priorEquityUsd: toNum(f.pe, 1e6),
    priorRounds: toNum(f.pr),
    monthsFirstFundingToA: toNum(f.m),
    ageMonthsAtA: toNum(f.age),
    seriesAInvestorCount: toNum(f.inv),
    hqState: f.st.trim() ? f.st.trim().toUpperCase() : null,
  }), [f]);
  const sc = useMemo(() => scoreCompany(input), [input]);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const field = (k: keyof Form, label: string) => (
    <label className="block text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input value={f[k]} onChange={set(k)} className="num mt-1 h-9 w-full rounded-md border bg-card px-2" />
    </label>
  );
  const mapSearch = {
    name: f.name, cat: f.cat,
    a: input.seriesAAmountUsd ?? undefined, pe: input.priorEquityUsd ?? undefined, pr: input.priorRounds ?? undefined,
    m: input.monthsFirstFundingToA ?? undefined, age: input.ageMonthsAtA ?? undefined, inv: input.seriesAInvestorCount ?? undefined,
    st: input.hqState ?? undefined,
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-8 md:grid-cols-[320px_1fr]">
        <section className="space-y-3">
          <h1 className="text-2xl">Series A Scorecard</h1>
          <p className="text-sm text-muted-foreground">Facts known at the company's first Series A. Leave a field blank if unknown.</p>
          {field("name", "Company name")}
          <label className="block text-sm">
            <span className="text-muted-foreground">Category</span>
            <select value={f.cat} onChange={set("cat")} className="mt-1 h-9 w-full rounded-md border bg-card px-2">
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          {field("a", "Series A size ($M)")}
          {field("pe", "Equity raised before Series A ($M)")}
          {field("pr", "Rounds before Series A")}
          {field("m", "Months from first funding to Series A")}
          {field("age", "Company age at Series A (months)")}
          {field("inv", "Number of Series A investors")}
          {field("st", "HQ state (e.g. CA)")}
        </section>
        <section className="space-y-6">
          <div className="rounded-md border bg-card p-5">
            <h2 className="text-lg">{f.name || "Your company"}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div><div className="text-xs text-muted-foreground">Raises Series B+ within 3 years</div><div className="num text-3xl">{pct(sc.stage3y.reachBOrLater)}</div><div className="num text-xs text-muted-foreground">base rate {pct(1 - sc.stage3y.baseRates.stayA)}</div></div>
              <div><div className="text-xs text-muted-foreground">Reaches Series C+ within 5 years</div><div className="num text-3xl">{pct(sc.stage5y.reachC)}</div><div className="num text-xs text-muted-foreground">base rate {pct(sc.stage5y.baseRates.reachC)}</div></div>
              <div><div className="text-xs text-muted-foreground">Unicorn score ($1B within 5y)</div><div className="num text-3xl">{pct(sc.unicorn.probability)}</div><div className="num text-xs text-muted-foreground">range {pct(sc.unicorn.range.low)}–{pct(sc.unicorn.range.high)} · {sc.unicorn.multipleOfBaseRate.toFixed(1)}× base</div></div>
            </div>
            <p className="num mt-4 text-xs text-muted-foreground">
              Higher than {sc.percentile.unicorn.toFixed(0)}% of {sc.percentile.cohortSize.toLocaleString()} historical {sc.percentile.category} companies · {sc.inputsProvided}/{sc.inputsTotal} inputs provided
            </p>
            <Button asChild className="mt-5"><Link to="/map" search={mapSearch}>Open on Comparables Map</Link></Button>
          </div>
          <div className="rounded-md border bg-card p-5">
            <h3 className="mb-2 text-sm">What moves the unicorn score</h3>
            <ul className="space-y-1 text-sm">
              {sc.unicorn.drivers.slice(0, 6).map((d) => (
                <li key={d.feature} className="flex justify-between gap-2"><span>{d.label}</span><span className="num">{d.contribution > 0 ? "+" : ""}{d.contribution.toFixed(2)}</span></li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
