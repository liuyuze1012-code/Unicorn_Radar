import type { HistoricalCompany, Neighbor, NeighborSummary } from "@/lib/comparables";
import { categoryStageAverage, formatUsd, outcomeOf, OUTCOME_LABEL, similarity, stageLabel, type Outcome } from "@/lib/mapModel";
import { Button } from "@/components/ui/button";

export const OUTCOME_BG: Record<Outcome, string> = {
  stayA: "bg-outcome-a",
  reachB: "bg-outcome-b",
  reachC: "bg-outcome-c",
  unicorn: "bg-outcome-unicorn",
  unobserved: "bg-outcome-unobserved",
};

export function OutcomeChip({ c }: { c: HistoricalCompany }) {
  const o = outcomeOf(c);
  const short: Record<Outcome, string> = { stayA: "A", reachB: "B", reachC: "C+", unicorn: "$1B", unobserved: "n/a" };
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] num">
      <span className={`size-2 rounded-full ${OUTCOME_BG[o]} ${c.unicorn === "later" ? "ring-1 ring-outcome-unicorn" : ""}`} />
      {short[o]}
    </span>
  );
}

function StackBar({ s }: { s: NeighborSummary["stage3y"] }) {
  const t = s.observed || 1;
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-sm bg-muted">
      <div className="bg-outcome-a" style={{ width: `${(s.stayA / t) * 100}%` }} />
      <div className="bg-outcome-b" style={{ width: `${(s.reachB / t) * 100}%` }} />
      <div className="bg-outcome-c" style={{ width: `${(s.reachC / t) * 100}%` }} />
    </div>
  );
}

const pct = (a: number, t: number) => (t ? `${Math.round((a / t) * 100)}%` : "–");

export function NeighborSummaryPanel({
  category, neighbors, summary, all, onHoverRow, onSelect,
}: {
  category: string;
  neighbors: Neighbor[];
  summary: NeighborSummary;
  all: HistoricalCompany[];
  onHoverRow: (id: number | null) => void;
  onSelect: (id: number) => void;
}) {
  const avg = categoryStageAverage(all, category);
  const maxD = neighbors.at(-1)?.distance ?? 1;
  const s = summary.stage3y;
  return (
    <div className="space-y-4 text-sm">
      <h2 className="text-lg leading-snug">Of the {summary.n} most similar {category} companies at their Series A:</h2>
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground"><span>Within 3 years</span><span>based on {s.observed} with known outcomes</span></div>
        <StackBar s={s} />
        <div className="flex justify-between text-xs num">
          <span>A {pct(s.stayA, s.observed)}</span><span>B {pct(s.reachB, s.observed)}</span><span>C+ {pct(s.reachC, s.observed)}</span>
        </div>
        <div className="pt-1 text-xs text-muted-foreground">Category average</div>
        <StackBar s={avg} />
        <div className="flex justify-between text-xs num text-muted-foreground">
          <span>A {pct(avg.stayA, avg.observed)}</span><span>B {pct(avg.reachB, avg.observed)}</span><span>C+ {pct(avg.reachC, avg.observed)}</span>
        </div>
      </div>
      <p><span className="text-muted-foreground">Became unicorns within 5 years: </span>{summary.unicornsWithin5y.map((c) => c.name).join(", ") || "none"}</p>
      <p><span className="text-muted-foreground">Reached $1B later: </span>{summary.unicornsLater.map((c) => c.name).join(", ") || "none"}</p>
      <p className="num text-xs">Acquired by 2013: {summary.acquiredBy2013} · Closed by 2013: {summary.closedBy2013}</p>
      <ol className="divide-y border-y">
        {neighbors.map((n, i) => (
          <li key={n.company.id}>
            <button
              className="flex w-full items-center gap-2 py-1.5 text-left hover:bg-accent"
              onMouseEnter={() => onHoverRow(n.company.id)}
              onMouseLeave={() => onHoverRow(null)}
              onClick={() => onSelect(n.company.id)}
            >
              <span className="w-5 text-right text-xs text-muted-foreground num">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{n.company.name} <span className="text-xs text-muted-foreground num">{n.company.year}</span></span>
              <span className="h-1.5 w-12 overflow-hidden rounded-sm bg-muted"><span className="block h-full bg-foreground" style={{ width: `${similarity(n.distance, maxD) * 100}%` }} /></span>
              <OutcomeChip c={n.company} />
            </button>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">Similarity uses all 8 Series A inputs, not the map position. Being near one famous company means little; look at the outcomes of all 25.</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3 py-1"><dt className="text-muted-foreground">{k}</dt><dd className="num text-right">{v}</dd></div>;
}
const orUnknown = (v: number | null, f: (n: number) => string = String) => (v === null ? "unknown" : f(v));

export function CompanyDetailPanel({ c, onFindLike, onClose }: { c: HistoricalCompany; onFindLike: () => void; onClose: () => void }) {
  const uni = c.unicorn === "within_5y" ? `Yes, within 5 years (${c.firstBillionDate})` : c.unicorn === "later" ? `Yes, later (${c.firstBillionDate})` : c.unicorn === "before_series_a" ? "Before Series A" : c.unicorn === "no" ? "No" : "Unknown";
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl">{c.name}</h2>
          <p className="text-xs text-muted-foreground num">Series A {c.seriesADate} · {c.category} · {c.hqState ?? "state unknown"}</p>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">✕</button>
      </div>
      <section>
        <h3 className="mb-1 text-sm">Series A inputs</h3>
        <dl className="divide-y text-xs">
          <Row k="Category" v={c.category} />
          <Row k="HQ state" v={c.hqState ?? "unknown"} />
          <Row k="Series A size" v={formatUsd(c.seriesAAmountUsd)} />
          <Row k="Equity before A" v={formatUsd(c.priorEquityUsd)} />
          <Row k="Rounds before A" v={orUnknown(c.priorRounds)} />
          <Row k="Months first funding → A" v={orUnknown(c.monthsFirstFundingToA, (n) => n.toFixed(0))} />
          <Row k="Age at A" v={orUnknown(c.ageMonthsAtA, (n) => `${(n / 12).toFixed(1)} years`)} />
          <Row k="Series A investors" v={orUnknown(c.seriesAInvestorCount)} />
        </dl>
      </section>
      <section>
        <h3 className="mb-1 text-sm">What happened</h3>
        <dl className="divide-y text-xs">
          <Row k="Within 3 years" v={stageLabel(c.stage3y)} />
          <Row k="Within 5 years" v={stageLabel(c.stage5y)} />
          <Row k="Unicorn" v={uni} />
          <Row k="Status in 2013" v={c.status2013 ?? "unknown"} />
        </dl>
      </section>
      <Button className="w-full" onClick={onFindLike}>Find companies like this one</Button>
    </div>
  );
}

export function Legend() {
  const items: [Outcome, string][] = [["stayA", "Stayed at A"], ["reachB", "Reached B"], ["reachC", "Reached C+"], ["unicorn", "Unicorn ≤5y"], ["unobserved", "Not yet observable"]];
  return (
    <div className="pointer-events-none rounded-md border bg-card/90 p-2 text-[11px] leading-5">
      {items.map(([o, l]) => (
        <div key={o} className="flex items-center gap-1.5"><span className={`size-2.5 rounded-full ${OUTCOME_BG[o]}`} title={OUTCOME_LABEL[o]} />{l}</div>
      ))}
      <div className="flex items-center gap-1.5"><span className="size-2.5 rounded-full ring-2 ring-outcome-unicorn" />Unicorn later</div>
      <div className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-2 border-foreground" />Analyzed company</div>
    </div>
  );
}
