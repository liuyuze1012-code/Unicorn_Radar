import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { saveCompany } from "@/lib/savedCompanies";
import { parseCompanySearch, toCompanyInput, type CompanySearch } from "@/lib/companyParams";
import { scoreCompany, type Driver, type StageForecast } from "@/lib/scoring";
import { StepNav } from "@/components/StepNav";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/scorecard/")({
  validateSearch: parseCompanySearch,
  head: () => ({
    meta: [
      { title: "Scorecard · Unicorn Radar" },
      { name: "description", content: "Series B, C and unicorn odds for a Series A company, compared with 5,819 historical companies." },
      { property: "og:title", content: "Scorecard · Unicorn Radar" },
      { property: "og:description", content: "Series B, C and unicorn odds for a Series A company." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScorecardPage,
});

const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

function ScorecardPage() {
  const s = Route.useSearch();
  useEffect(() => { if (s.cat) void saveCompany(s.name || "Your company", s); }, [s]);
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-10">
        {s.cat ? <Result s={{ ...s, cat: s.cat }} /> : <Empty />}
      </main>
    </div>
  );
}

function Empty() {
  return (
    <div className="mx-auto mt-10 max-w-2xl rounded-2xl border bg-card px-8 py-16 text-center">
      <h1 className="text-4xl">No company scored yet</h1>
      <p className="mt-3 text-muted-foreground">Enter a company's Series A facts to see its forecast.</p>
      <Button asChild size="lg" className="mt-8 h-14 px-8 text-base"><Link to="/scorecard/new" search={{}}>Enter company information →</Link></Button>
    </div>
  );
}

function StageBars({ f }: { f: StageForecast }) {
  const rows = [
    { label: "Stayed at Series A", v: f.stayA, base: f.baseRates.stayA, cls: "bg-outcome-a" },
    { label: "Reached Series B", v: f.reachB, base: f.baseRates.reachB, cls: "bg-outcome-b" },
    { label: "Reached Series C or later", v: f.reachC, base: f.baseRates.reachC, cls: "bg-outcome-c" },
  ];
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between text-sm"><span>{r.label}</span><span className="num">{pct(r.v)} <span className="text-muted-foreground">· avg {pct(r.base)}</span></span></div>
          <div className="relative mt-1 h-2.5 rounded-sm bg-muted">
            <div className={`h-full rounded-sm ${r.cls}`} style={{ width: `${r.v * 100}%` }} />
            <div className="absolute top-[-3px] h-4 w-0.5 bg-foreground" style={{ left: `${r.base * 100}%` }} title="Historical average" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Drivers({ ds }: { ds: Driver[] }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {ds.slice(0, 6).map((d) => (
        <li key={d.feature} className="flex justify-between gap-3">
          <span>{d.label}</span>
          <span className={`num ${d.contribution > 0 ? "text-positive" : "text-negative"}`}>{d.contribution > 0 ? "↑ raises" : "↓ lowers"} {Math.abs(d.contribution).toFixed(2)}</span>
        </li>
      ))}
    </ul>
  );
}

function Result({ s }: { s: CompanySearch & { cat: NonNullable<CompanySearch["cat"]> } }) {
  const input = useMemo(() => toCompanyInput(s), [s]);
  const sc = useMemo(() => scoreCompany(input), [input]);
  const name = s.name ?? "Unnamed company";
  const mapSearch = { ...s, name };
  const u = sc.unicorn;
  return (
    <div className="space-y-6">
      <StepNav current={1} search={mapSearch} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{s.cat}{s.st ? ` · ${s.st}` : ""}</p>
          <h1 className="text-4xl sm:text-5xl">{name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="lg"><Link to="/map" search={mapSearch}>Step 2: Open on Comparables Map →</Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/scorecard/new" search={s}>Edit information</Link></Button>
        </div>
      </div>
      <Link to="/scorecard/new" search={{}} className="inline-block text-sm text-muted-foreground underline">Score another company</Link>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border bg-card p-6">
          <h2 className="text-xl">Within 3 years</h2>
          <div className="mt-4"><StageBars f={sc.stage3y} /></div>
          <h2 className="mt-8 text-xl">Within 5 years</h2>
          <div className="mt-4"><StageBars f={sc.stage5y} /></div>
          <p className="mt-4 text-xs text-muted-foreground">Black tick = historical average for all companies.</p>
        </div>
        <div className="space-y-6">
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-xl">Odds of a $1B round within 5 years</h2>
            <div className="num mt-3 text-5xl">{pct(u.probability)}</div>
            <p className="num mt-1 text-sm text-muted-foreground">likely range {pct(u.range.low)}–{pct(u.range.high)} · average {pct(u.baseRate)}</p>
            <p className="mt-3 text-sm">
              <span className={`num font-medium ${u.multipleOfBaseRate >= 1 ? "text-positive" : "text-negative"}`}>{u.multipleOfBaseRate.toFixed(1)}×</span> the average odds
              <span className="num text-muted-foreground"> (range {u.multipleRange.low.toFixed(1)}–{u.multipleRange.high.toFixed(1)}×)</span>
            </p>
            <p className="num mt-3 text-sm text-muted-foreground">
              Higher than {sc.percentile.unicorn.toFixed(0)}% of {sc.percentile.cohortSize.toLocaleString()} historical {sc.percentile.category} companies. Series B odds higher than {sc.percentile.stage3yReachB.toFixed(0)}%.
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="mb-3 text-xl">What moves the unicorn odds</h2>
            <Drivers ds={u.drivers} />
          </div>
          <div className="rounded-2xl border bg-card p-6 text-sm">
            <h2 className="text-xl">Inputs</h2>
            <p className="num mt-1 text-muted-foreground">{sc.inputsProvided} of {sc.inputsTotal} provided</p>
            {sc.missingInputs.length > 0 && <p className="mt-2">Missing: {sc.missingInputs.join(", ")}. Adding them makes the forecast more specific.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
