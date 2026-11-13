import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { findNeighbors, getHistoricalCompanies, type HistoricalCompany } from "@/lib/comparables";
import { parseCompanySearch, toCompanyInput, type CompanySearch } from "@/lib/companyParams";
import { closestUnicorns, takeaways } from "@/lib/lessons";
import { writeUnicornStories } from "@/lib/lessons.functions";
import { formatUsd, outcomeOf, stageLabel, type Outcome } from "@/lib/mapModel";
import type { CompanyInput } from "@/lib/scoring";
import { SiteHeader } from "@/components/SiteHeader";
import { StepNav } from "@/components/StepNav";
import { Button } from "@/components/ui/button";

type LessonsSearch = CompanySearch & { id?: number | undefined };

export const Route = createFileRoute("/lessons")({
  validateSearch: (s: Record<string, unknown>): LessonsSearch => ({
    ...parseCompanySearch(s),
    id: s["id"] !== undefined && Number.isFinite(Number(s["id"])) ? Number(s["id"]) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Unicorn Lessons · Unicorn Radar" },
      { name: "description", content: "A close-up map of the 5 unicorns most like your company, with their stories and what you can copy." },
      { property: "og:title", content: "Unicorn Lessons · Unicorn Radar" },
      { property: "og:description", content: "The 5 closest historical unicorns to your company and the lessons to copy." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LessonsPage,
});

const FILL: Record<Outcome, string> = { stayA: "fill-outcome-a", reachB: "fill-outcome-b", reachC: "fill-outcome-c", unicorn: "fill-outcome-unicorn", unobserved: "fill-outcome-unobserved" };

/** Split "## Name" sections; returns heading → lines. */
function sections(text: string) {
  const out: { title: string; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    if (l.startsWith("## ")) out.push({ title: l.slice(3).trim(), lines: [] });
    else if (l && out.length) out.at(-1)!.lines.push(l.replace(/^[-*]\s+/, "").replace(/\*\*/g, ""));
  }
  return out;
}
const findSection = (s: ReturnType<typeof sections>, name: string) => s.find((x) => x.title.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(x.title.toLowerCase()));

function Bullets({ lines }: { lines: string[] }) {
  return <ul className="space-y-2 text-sm">{lines.map((l, i) => <li key={i} className="flex gap-2"><span className="text-outcome-unicorn">●</span><span>{l}</span></li>)}</ul>;
}

function LessonsPage() {
  const search = Route.useSearch();
  const all = useMemo(() => getHistoricalCompanies(), []);
  const write = useServerFn(writeUnicornStories);
  const [selected, setSelected] = useState<number | "you">("you");

  const focus = useMemo((): { input: CompanyInput; name: string; excludeId?: number } | null => {
    if (search.id !== undefined && all[search.id]) { const c = all[search.id]!; return { input: c, name: c.name, excludeId: c.id }; }
    if (search.cat) return { input: toCompanyInput({ ...search, cat: search.cat }), name: search.name || "Your company" };
    return null;
  }, [search, all]);
  const unicorns = useMemo(() => (focus ? closestUnicorns(focus.input, 5, focus.excludeId) : []), [focus]);
  const context = useMemo(() => (focus ? findNeighbors(focus.input, { k: 25, ...(focus.excludeId !== undefined ? { excludeId: focus.excludeId } : {}) }) : []), [focus]);

  const stories = useQuery({
    queryKey: ["stories", focus?.name, unicorns.map((u) => u.company.id).join(",")],
    enabled: !!focus && unicorns.length > 0,
    staleTime: Infinity,
    retry: false,
    queryFn: () => write({ data: { name: focus!.name, input: focus!.input, ids: unicorns.map((u) => u.company.id) } }),
  });
  const secs = stories.data && "text" in stories.data ? sections(stories.data.text) : [];
  const storyError = stories.isError ? "Couldn't write the stories right now. Please try again later." : stories.data && "error" in stories.data ? stories.data.error : null;

  if (!focus) {
    return (
      <div className="min-h-screen bg-background"><SiteHeader />
        <div className="space-y-4 py-24 text-center">
          <h1 className="text-3xl">No company yet</h1>
          <p className="text-muted-foreground">Score a company first, then zoom in on the unicorns most like it.</p>
          <Button asChild><Link to="/scorecard/new" search={{}}>Score a company</Link></Button>
        </div>
      </div>
    );
  }

  // Radial layout: you in the centre, unicorns around you; closer = more similar.
  const S = 600, C = S / 2;
  const maxD = Math.max(...context.map((n) => n.distance), ...unicorns.map((u) => u.distance), 1e-6);
  const r = (d: number) => 70 + (d / maxD) * 190;
  const uPos = unicorns.map((u, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / unicorns.length;
    const rr = Math.min(r(u.distance), 230);
    return { u, x: C + rr * Math.cos(a), y: C + rr * Math.sin(a) };
  });
  const uIds = new Set(unicorns.map((u) => u.company.id));
  const ctxPos = context.filter((n) => !uIds.has(n.company.id)).map((n) => {
    const a = (n.company.id * 2.399963) % (2 * Math.PI);
    return { n, x: C + r(n.distance) * Math.cos(a), y: C + r(n.distance) * Math.sin(a) };
  });

  const sel: HistoricalCompany | null = selected === "you" ? null : all[selected] ?? null;
  const selRank = sel ? unicorns.findIndex((u) => u.company.id === sel.id) + 1 : 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <div className="border-b px-4 py-3">
        <StepNav current={3} search={search} />
        <h1 className="mt-2 text-2xl">Unicorn Lessons for {focus.name}</h1>
        <p className="text-sm text-muted-foreground">Zoomed in on the 5 historical unicorns most like you. Closer to the centre means more similar at Series A. Click a unicorn to read its story.</p>
      </div>
      <div className="flex flex-1 flex-col lg:flex-row">
        <div className="relative flex flex-1 items-start justify-center p-4">
          <svg viewBox={`0 0 ${S} ${S}`} className="w-full max-w-[640px] animate-in fade-in zoom-in-50 duration-700" role="img" aria-label="Your company and the 5 closest unicorns">
            {[90, 160, 230].map((rr) => <circle key={rr} cx={C} cy={C} r={rr} className="fill-none stroke-border" strokeDasharray="3 5" />)}
            {ctxPos.map(({ n, x, y }) => <circle key={n.company.id} cx={x} cy={y} r={4} className={`${FILL[outcomeOf(n.company)]} opacity-40`}><title>{n.company.name}</title></circle>)}
            {uPos.map(({ u, x, y }) => <line key={u.company.id} x1={C} y1={C} x2={x} y2={y} className="stroke-outcome-unicorn" strokeOpacity={selected === u.company.id ? 0.9 : 0.35} strokeWidth={selected === u.company.id ? 2 : 1} />)}
            {uPos.map(({ u, x, y }, i) => {
              const on = selected === u.company.id;
              return (
                <g key={u.company.id} className="cursor-pointer" onClick={() => setSelected(u.company.id)} role="button" aria-label={`${u.company.name} story`} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSelected(u.company.id)}>
                  <circle cx={x} cy={y} r={on ? 26 : 20} className={`fill-outcome-unicorn transition-all ${on ? "stroke-foreground" : "stroke-background"}`} strokeWidth={3} />
                  <text x={x} y={y + 4} textAnchor="middle" className="fill-foreground text-[12px] font-semibold">{i + 1}</text>
                  <text x={x} y={y + (y < C ? -32 : 42)} textAnchor="middle" className="fill-foreground text-[14px] font-medium">{u.company.name}</text>
                </g>
              );
            })}
            <g className="cursor-pointer" onClick={() => setSelected("you")} role="button" aria-label="Your takeaways" tabIndex={0}>
              <circle cx={C} cy={C} r={selected === "you" ? 34 : 30} className="fill-foreground transition-all" />
              <text x={C} y={C + 4} textAnchor="middle" className="fill-background text-[12px] font-semibold">YOU</text>
              <text x={C} y={C + 54} textAnchor="middle" className="fill-foreground text-[14px] font-semibold">{focus.name}</text>
            </g>
          </svg>
          <div className="absolute bottom-3 left-3 rounded-md border bg-card/90 p-2 text-[11px] leading-5">
            <div className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-outcome-unicorn" />Closest unicorns (click)</div>
            <div className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-outcome-unobserved opacity-60" />Other similar companies</div>
          </div>
        </div>

        <aside className="w-full shrink-0 space-y-5 border-t bg-card p-5 lg:w-[420px] lg:border-l lg:border-t-0">
          {sel ? (
            <>
              <div>
                <p className="text-xs text-muted-foreground">Unicorn #{selRank} closest to you</p>
                <h2 className="text-2xl">{sel.name}</h2>
                <p className="num text-xs text-muted-foreground">{sel.category} · {sel.hqState ?? "state unknown"} · Series A {sel.seriesADate} · $1B {sel.firstBillionDate ?? "reached"}</p>
              </div>
              <section className="space-y-2">
                <h3 className="text-sm font-medium">Their story</h3>
                {stories.isLoading ? <p className="text-sm text-muted-foreground">Writing stories for the 5 unicorns… this takes about a minute.</p>
                  : storyError ? <p className="text-sm text-destructive">{storyError}</p>
                  : findSection(secs, sel.name) ? <Bullets lines={findSection(secs, sel.name)!.lines} />
                  : <p className="text-sm text-muted-foreground">No story available for this company.</p>}
                <p className="text-[11px] text-muted-foreground">Written by AI. It can get facts wrong, so check anything important.</p>
              </section>
              <section className="space-y-2">
                <h3 className="text-sm font-medium">You vs. {sel.name} at Series A</h3>
                <dl className="divide-y text-xs">
                  {takeaways(focus.input, [sel]).map((t) => (
                    <div key={t.label} className="py-1.5">
                      <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t.label}</dt><dd className="num">You {t.yours} · Them {t.theirs}</dd></div>
                      <p className="mt-0.5">{t.note}</p>
                    </div>
                  ))}
                </dl>
                <p className="text-xs">After Series A: {stageLabel(sel.stage3y)} within 3 years; raised {formatUsd(sel.seriesAAmountUsd)} at A.</p>
              </section>
            </>
          ) : (
            <>
              <div>
                <p className="text-xs text-muted-foreground">Centre of the map</p>
                <h2 className="text-2xl">What {focus.name} can copy</h2>
              </div>
              <section className="space-y-2">
                {stories.isLoading ? <p className="text-sm text-muted-foreground">Writing stories and lessons from the 5 unicorns… this takes about a minute.</p>
                  : storyError ? <p className="text-sm text-destructive">{storyError}</p>
                  : <Bullets lines={findSection(secs, "What you can copy")?.lines ?? []} />}
                <p className="text-[11px] text-muted-foreground">Written by AI from these 5 unicorns. It can get facts wrong.</p>
              </section>
              <section className="space-y-2">
                <h3 className="text-sm font-medium">By the numbers: you vs. the middle of these 5</h3>
                <dl className="divide-y text-xs">
                  {takeaways(focus.input, unicorns.map((u) => u.company)).map((t) => (
                    <div key={t.label} className="py-1.5">
                      <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{t.label}</dt><dd className="num">You {t.yours} · Them {t.theirs}</dd></div>
                      <p className="mt-0.5">{t.note}</p>
                    </div>
                  ))}
                </dl>
              </section>
              <div className="flex flex-wrap gap-2">{unicorns.map((u, i) => <Button key={u.company.id} size="sm" variant="outline" onClick={() => setSelected(u.company.id)}>{i + 1}. {u.company.name}</Button>)}</div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
