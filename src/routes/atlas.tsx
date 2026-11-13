import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Check, ArrowUp, ArrowDown, Minus, Plus, LocateFixed } from "lucide-react";
import { compareTraits, findNearestUnicorns, type UnicornMatch } from "@/lib/comparables";
import { CATEGORIES, scoreCompany, type Category, type CompanyInput } from "@/lib/scoring";
import { closenessSentence, headline, honestyLine, multipleSentence, stageSentence, yearOf } from "@/lib/atlas";
import { AtlasMap, placePins, type AtlasMapHandle } from "@/components/atlas/AtlasMap";
import { Questions, type AtlasAnswers } from "@/components/atlas/Questions";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

type AtlasSearch = { [K in keyof AtlasAnswers]?: AtlasAnswers[K] | undefined };
const num = (v: unknown) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));

export const Route = createFileRoute("/atlas")({
  validateSearch: (s: { [K in keyof AtlasSearch]?: unknown }): AtlasSearch => ({
    cat: CATEGORIES.includes(s.cat as Category) ? (s.cat as Category) : undefined,
    a: num(s.a), inv: num(s.inv), age: num(s.age), pe: num(s.pe),
    st: typeof s.st === "string" && s.st ? s.st : undefined,
    name: typeof s.name === "string" ? s.name : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Unicorn Atlas · Which unicorns did you look like?" },
      { name: "description", content: "Answer a few plain questions and see which real unicorns your company resembled at its Series A." },
      { property: "og:title", content: "Unicorn Atlas" },
      { property: "og:description", content: "See which real unicorns your company resembled at its Series A, with honest odds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AtlasPage,
});

function AtlasPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/atlas" });
  return (
    <div className="flex min-h-screen flex-col bg-atlas-paper">
      <SiteHeader />
      {search.cat ? (
        <AtlasResult s={{ ...search, cat: search.cat }} />
      ) : (
        <Questions onDone={(a) => navigate({ search: a })} />
      )}
    </div>
  );
}

function AtlasResult({ s }: { s: AtlasAnswers }) {
  const isMobile = useIsMobile();
  const map = useRef<AtlasMapHandle>(null);
  const input: CompanyInput = useMemo(() => ({
    category: s.cat,
    seriesAAmountUsd: s.a ?? null,
    priorEquityUsd: s.pe ?? null,
    priorRounds: null,
    monthsFirstFundingToA: null,
    ageMonthsAtA: s.age ?? null,
    seriesAInvestorCount: s.inv ?? null,
    hqState: s.st ?? null,
  }), [s]);
  const { sameCategory, otherCategories } = useMemo(() => findNearestUnicorns(input, { k: 6 }), [input]);
  const score = useMemo(() => scoreCompany(input), [input]);
  const pins = useMemo(() => placePins(sameCategory, otherCategories), [sameCategory, otherCategories]);
  const ordered = useMemo(() => [...pins].sort((a, b) => Number(b.same) - Number(a.same) || a.match.rank - b.match.rank), [pins]);
  const [hover, setHover] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const sel = pins.find((p) => p.match.company.id === selected) ?? null;
  const nextPin = () => {
    const i = ordered.findIndex((p) => p.match.company.id === selected);
    setSelected(ordered[(i + 1) % ordered.length]!.match.company.id);
  };
  const mapSearch = { cat: s.cat, a: s.a, inv: s.inv, age: s.age, pe: s.pe, st: s.st, name: "Your company" };

  return (
    <main className="flex flex-1 flex-col">
      <section className="space-y-3 px-5 py-6 sm:px-8">
        <h1 className="max-w-3xl text-2xl leading-snug sm:text-3xl">{headline(sameCategory)}</h1>
        <p className="max-w-3xl text-muted-foreground">{honestyLine(sameCategory[0], s.cat)}</p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="rounded-full border bg-card px-4 py-2 text-sm"><span className="font-medium">Your forecast:</span> {stageSentence(score.stage3y.reachBOrLater)} · {multipleSentence(score.unicorn.multipleOfBaseRate)}</span>
          <Link to="/atlas" search={{}} className="px-2 text-sm text-muted-foreground underline">Start over</Link>
          <Link to="/map" search={mapSearch} className="px-2 text-sm text-muted-foreground underline">Advanced view</Link>
        </div>
      </section>

      <div className="flex flex-1 border-t">
        {!isMobile && (
          <aside className="w-72 shrink-0 overflow-y-auto border-r bg-card/60 p-4">
            <h2 className="mb-3 text-base">Unicorns most like you</h2>
            <ol className="space-y-1">
              {ordered.map((p) => (
                <li key={p.match.company.id}>
                  <button
                    onMouseEnter={() => setHover(p.match.company.id)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setSelected(p.match.company.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-accent"
                  >
                    <span>
                      <span className="block font-medium">{p.match.company.name}</span>
                      <span className="block text-xs text-muted-foreground">{p.same ? "Your industry" : p.match.company.category}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs">{p.match.band}</span>
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        )}
        <div className="relative min-h-[72vh] flex-1 md:min-h-[520px]">
          <div className="absolute inset-0">
            <AtlasMap ref={map} category={s.cat} pins={pins} highlightId={hover} selectedId={selected} onSelect={setSelected} onHover={setHover} slice={isMobile} />
          </div>
          <div className="absolute right-3 top-3 flex flex-col gap-2">
            <Button size="icon" variant="outline" className="size-11 bg-card" aria-label="Zoom in" onClick={() => map.current?.zoomIn()}><Plus /></Button>
            <Button size="icon" variant="outline" className="size-11 bg-card" aria-label="Zoom out" onClick={() => map.current?.zoomOut()}><Minus /></Button>
            <Button size="icon" variant="outline" className="size-11 bg-card" aria-label="Re-center on me" title="Re-center on me" onClick={() => map.current?.recenter()}><LocateFixed /></Button>
          </div>
          <p className="pointer-events-none absolute bottom-3 left-3 max-w-xs rounded-lg bg-card/85 px-3 py-2 text-xs italic text-muted-foreground">
            Distance from your pin = how similar each company was to you at its Series A. Distances between other pins mean nothing.
          </p>
        </div>
      </div>

      <Sheet open={!!sel} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side={isMobile ? "bottom" : "right"} className="max-h-[88vh] overflow-y-auto sm:max-w-md">
          {sel && <StoryCard m={sel.match} same={sel.same} input={input} onNext={nextPin} mapSearch={mapSearch} />}
        </SheetContent>
      </Sheet>
    </main>
  );
}

const yearsBetween = (a: string | null | undefined, b: string | null | undefined) => {
  if (!a || !b) return null;
  const d = (new Date(`${b.slice(0, 7)}-01`).getTime() - new Date(`${a.length === 4 ? `${a}-01` : a.slice(0, 7)}-01`).getTime()) / 3.156e10;
  return d >= 0 ? `${d.toFixed(1)} years` : null;
};

function StoryCard({ m, same, input, onNext, mapSearch }: { m: UnicornMatch; same: boolean; input: CompanyInput; onNext: () => void; mapSearch: Record<string, unknown> }) {
  const c = m.company;
  const p = m.profile;
  const founded = p?.founded ?? null;
  const rows = compareTraits(input, c);
  const steps = [
    { label: "Founded", date: founded ? founded.slice(0, 7) : null },
    { label: "Series A", date: c.seriesADate },
    { label: "$1B valuation", date: c.firstBillionDate },
  ];
  return (
    <div className="space-y-6 px-5 pb-6">
      <SheetHeader className="px-0">
        <SheetTitle className="font-serif text-2xl">{c.name}</SheetTitle>
        {p?.tagline && <p className="text-muted-foreground">{p.tagline}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
          {p?.city && <span>{p.city}</span>}
          {founded && <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs">Founded {yearOf(founded)}</span>}
          {p?.website && <a href={p.website.startsWith("http") ? p.website : `https://${p.website}`} target="_blank" rel="noreferrer" className="underline">Website</a>}
        </div>
      </SheetHeader>

      {p?.about2013 && (
        <div>
          <p className="text-sm text-muted-foreground">Back in 2013 they described themselves as:</p>
          <blockquote className="mt-1 border-l-2 pl-3 font-serif italic">“{p.about2013}”</blockquote>
        </div>
      )}

      <ol className="flex items-start">
        {steps.map((st, i) => (
          <li key={st.label} className="flex flex-1 items-start">
            <div className="flex flex-col items-center text-center">
              <span className="size-3 rounded-full bg-atlas-gold" />
              <span className="mt-1 text-xs font-medium">{st.label}</span>
              <span className="num text-xs text-muted-foreground">{st.date ?? "unknown"}</span>
            </div>
            {i < steps.length - 1 && (
              <div className="mx-1 mt-1 flex-1 text-center">
                <div className="h-px w-full bg-border" />
                <span className="text-[11px] text-muted-foreground">{yearsBetween(st.date, steps[i + 1]!.date) ?? ""}</span>
              </div>
            )}
          </li>
        ))}
      </ol>

      <div>
        <h3 className="mb-2 text-base">You vs. {c.name} at Series A</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 font-normal" /><th className="font-normal">You</th><th className="font-normal">{c.name}</th></tr></thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.label} className={r.comparison === "different" || r.comparison === "unknown" ? "text-muted-foreground" : ""}>
                <td className="py-2 pr-2">{r.label}</td>
                <td className="num pr-2">
                  <span className="inline-flex items-center gap-1">
                    {r.comparison === "similar" && <Check className="size-4 text-atlas-positive" aria-label="similar" />}
                    {r.comparison === "you higher" && <ArrowUp className="size-3.5" aria-label="you higher" />}
                    {r.comparison === "you lower" && <ArrowDown className="size-3.5" aria-label="you lower" />}
                    {r.yours}
                  </span>
                </td>
                <td className="num">{r.theirs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="rounded-lg bg-muted p-3 text-sm">{closenessSentence(m, input.category, same)}</p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild className="h-11 flex-1"><Link to="/map" search={mapSearch}>See all companies like mine</Link></Button>
        <Button variant="outline" className="h-11" onClick={onNext}>Next unicorn ›</Button>
      </div>
    </div>
  );
}
