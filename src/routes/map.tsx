import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { findNeighbors, getHistoricalCompanies, summarize } from "@/lib/comparables";
import { CATEGORIES, scoreCompany, type Category, type CompanyInput } from "@/lib/scoring";
import { formatUsd, outcomeOf, OUTCOME_LABEL, OUTCOMES, PRESETS, type Outcome } from "@/lib/mapModel";
import { ComparablesCanvas, type CanvasHandle, type FocusPoint } from "@/components/map/ComparablesCanvas";
import { CompanyDetailPanel, Legend, NeighborSummaryPanel, OUTCOME_BG } from "@/components/map/panels";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

export interface MapSearch {
  id?: number | undefined;
  name?: string | undefined;
  cat?: Category | undefined;
  a?: number | undefined;
  pe?: number | undefined;
  pr?: number | undefined;
  m?: number | undefined;
  age?: number | undefined;
  inv?: number | undefined;
  st?: string | undefined;
}

const num = (v: unknown) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));

export const Route = createFileRoute("/map")({
  validateSearch: (s: { [K in keyof MapSearch]?: unknown }): MapSearch => ({
    id: num(s.id),
    name: typeof s.name === "string" ? s.name : undefined,
    cat: CATEGORIES.includes(s.cat as Category) ? (s.cat as Category) : undefined,
    a: num(s.a), pe: num(s.pe), pr: num(s.pr), m: num(s.m), age: num(s.age), inv: num(s.inv),
    st: typeof s.st === "string" ? s.st : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Comparables Map · Unicorn Radar" },
      { name: "description", content: "Explore 5,819 historical U.S. Series A companies and see what happened to the ones most like yours." },
      { property: "og:title", content: "Comparables Map · Unicorn Radar" },
      { property: "og:description", content: "Explore 5,819 historical Series A companies and the outcomes of the closest comparables." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MapPage,
});

type FocusState = { input: CompanyInput; name: string; excludeId?: number; point: FocusPoint } | null;

function MapPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/map" });
  const all = useMemo(() => getHistoricalCompanies(), []);
  const isMobile = useIsMobile();
  const canvas = useRef<CanvasHandle>(null);

  const focus: FocusState = useMemo(() => {
    if (search.id !== undefined && all[search.id]) {
      const c = all[search.id]!;
      return { input: c, name: c.name, excludeId: c.id, point: { ...c, name: c.name } };
    }
    if (search.cat) {
      const input: CompanyInput = {
        category: search.cat,
        seriesAAmountUsd: search.a ?? null,
        priorEquityUsd: search.pe ?? null,
        priorRounds: search.pr ?? null,
        monthsFirstFundingToA: search.m ?? null,
        ageMonthsAtA: search.age ?? null,
        seriesAInvestorCount: search.inv ?? null,
        hqState: search.st ?? null,
      };
      const sc = scoreCompany(input);
      const name = search.name || "Your company";
      return { input, name, point: { ...input, name, stageScore: sc.stage3y.reachBOrLater, unicornScore: sc.unicorn.probability } };
    }
    return null;
  }, [search, all]);

  const neighbors = useMemo(() => (focus ? findNeighbors(focus.input, { k: 25, sameCategory: true, ...(focus.excludeId !== undefined ? { excludeId: focus.excludeId } : {}) }) : []), [focus]);
  const summary = useMemo(() => summarize(neighbors), [neighbors]);
  const neighborIds = useMemo(() => new Set(neighbors.map((n) => n.company.id)), [neighbors]);

  const [preset, setPreset] = useState(0);
  const [category, setCategory] = useState<Category | "all">(focus?.input.category ?? "all");
  const [years, setYears] = useState<[number, number]>([2005, 2013]);
  const [outcomes, setOutcomes] = useState<Set<Outcome>>(new Set(OUTCOMES));
  const [unicornsOnly, setUnicornsOnly] = useState(false);
  const [showLines, setShowLines] = useState(true);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);
  const [rowHover, setRowHover] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  useEffect(() => {
    setCategory(focus?.input.category ?? "all");
    setSelected(null);
  }, [focus]);

  const visible = useMemo(
    () =>
      all.map(
        (c) =>
          (category === "all" || c.category === category) &&
          c.year >= years[0] && c.year <= years[1] &&
          outcomes.has(outcomeOf(c)) &&
          (!unicornsOnly || c.unicorn === "within_5y" || c.unicorn === "later"),
      ),
    [all, category, years, outcomes, unicornsOnly],
  );
  const shown = visible.filter(Boolean).length;

  const names = useMemo(() => [...all].sort((a, b) => a.name.localeCompare(b.name)), [all]);
  const runSearch = (q: string) => {
    const t = q.trim().toLowerCase();
    if (!t) return;
    const c = all.find((x) => x.name.toLowerCase() === t) ?? all.find((x) => x.name.toLowerCase().startsWith(t)) ?? all.find((x) => x.name.toLowerCase().includes(t));
    if (!c) return;
    if (category !== "all" && c.category !== category) setCategory("all");
    setYears(([a, b]) => [Math.min(a, c.year), Math.max(b, c.year)]);
    setOutcomes(new Set(OUTCOMES));
    setUnicornsOnly(false);
    setSelected(c.id);
    canvas.current?.zoomTo(c.id);
  };

  const selectedCompany = selected !== null ? all[selected]! : null;
  const findLike = (id: number) => navigate({ search: { id } });
  const hoverCompany = hover ? all[hover.id] : null;

  const summaryPanel = focus && (
    <NeighborSummaryPanel
      category={focus.input.category}
      neighbors={neighbors}
      summary={summary}
      all={all}
      onHoverRow={setRowHover}
      onSelect={(id) => { setSelected(id); setSummaryOpen(false); }}
    />
  );
  const detailPanel = selectedCompany && (
    <CompanyDetailPanel c={selectedCompany} onClose={() => setSelected(null)} onFindLike={() => findLike(selectedCompany.id)} />
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <div className="border-b px-4 py-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl">Comparables Map</h1>
            <p className="text-sm text-muted-foreground">
              {focus ? <>Showing <strong className="text-foreground">{focus.name}</strong> among {all.length.toLocaleString()} historical U.S. Series A companies.</> : <>{all.length.toLocaleString()} historical U.S. Series A companies, 2005–2013. Click any dot to explore it.</>}
              {focus && <> <Link to="/map" search={{}} className="underline">Clear</Link></>}
            </p>
          </div>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Axes">
            {PRESETS.map((p, i) => (
              <Button key={p.name} size="sm" variant={preset === i ? "default" : "outline"} onClick={() => setPreset(i)}>{p.name}</Button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <select
            aria-label="Category"
            className="h-8 rounded-md border bg-card px-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category | "all")}
          >
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <span className="num text-xs">{years[0]}</span>
            <Slider className="w-32" min={2005} max={2013} step={1} value={years} onValueChange={(v) => setYears([v[0]!, v[1]!])} aria-label="Series A year range" />
            <span className="num text-xs">{years[1]}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {OUTCOMES.map((o) => (
              <label key={o} className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={outcomes.has(o)}
                  onCheckedChange={(v) => setOutcomes((prev) => { const n = new Set(prev); if (v) n.add(o); else n.delete(o); return n; })}
                />
                <span className={`size-2 rounded-full ${OUTCOME_BG[o]}`} />
                {OUTCOME_LABEL[o]}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs"><Switch checked={unicornsOnly} onCheckedChange={setUnicornsOnly} />Unicorns only</label>
          {focus && <label className="flex items-center gap-2 text-xs"><Switch checked={showLines} onCheckedChange={setShowLines} />Neighbor lines</label>}
          <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); runSearch(query); }}>
            <input
              list="company-names"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a company…"
              className="h-8 w-44 rounded-md border bg-card px-2 text-sm"
              aria-label="Search company"
            />
            <datalist id="company-names">{names.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            <Button size="sm" variant="outline" type="submit">Go</Button>
          </form>
        </div>
      </div>

      <div className="relative flex min-h-[560px] flex-1">
        {focus && !isMobile && <aside className="w-80 shrink-0 overflow-y-auto border-r p-4" style={{ maxHeight: "calc(100vh - 140px)" }}>{summaryPanel}</aside>}
        <div className="relative min-h-[560px] flex-1">
          <ComparablesCanvas
            ref={canvas}
            companies={all}
            preset={preset}
            visible={visible}
            focus={focus?.point ?? null}
            neighborIds={neighborIds}
            showLines={showLines}
            highlightId={rowHover}
            selectedId={selected}
            onHover={(id, x, y) => setHover(id === null ? null : { id, x, y })}
            onSelect={setSelected}
          />
          <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
            <Button size="sm" variant="outline" className="bg-card" onClick={() => canvas.current?.reset()}>Reset view</Button>
            {focus && isMobile && <Button size="sm" onClick={() => setSummaryOpen(true)}>Comparables summary</Button>}
          </div>
          <div className="absolute bottom-16 right-3"><Legend /></div>
          <div className="pointer-events-none absolute left-24 top-3 text-xs text-muted-foreground num">{shown.toLocaleString()} shown</div>
          {hoverCompany && hover && (
            <div className="pointer-events-none absolute z-10 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-sm" style={{ left: hover.x + 14, top: hover.y + 10 }}>
              <div className="font-medium">{hoverCompany.name}</div>
              <div className="num text-muted-foreground">{hoverCompany.seriesADate} · {hoverCompany.category}</div>
              <div className="num">Series A {formatUsd(hoverCompany.seriesAAmountUsd)}</div>
              <div>{OUTCOME_LABEL[outcomeOf(hoverCompany)]}{hoverCompany.unicorn === "later" ? " · $1B later" : ""}</div>
            </div>
          )}
        </div>
        {selectedCompany && !isMobile && (
          <aside className="absolute right-0 top-0 z-20 h-full w-80 overflow-y-auto border-l bg-card p-4">{detailPanel}</aside>
        )}
      </div>

      {isMobile && (
        <>
          <Sheet open={summaryOpen} onOpenChange={setSummaryOpen}>
            <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
              <SheetHeader><SheetTitle>Comparables</SheetTitle></SheetHeader>
              <div className="px-4 pb-4">{summaryPanel}</div>
            </SheetContent>
          </Sheet>
          <Sheet open={!!selectedCompany} onOpenChange={(o) => !o && setSelected(null)}>
            <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
              <SheetHeader><SheetTitle className="sr-only">Company detail</SheetTitle></SheetHeader>
              <div className="px-4 pb-4">{detailPanel}</div>
            </SheetContent>
          </Sheet>
        </>
      )}

      <footer className="border-t px-4 py-3 text-xs text-muted-foreground">
        Data: Crunchbase 2013 snapshot (CC BY 4.0). Unicorn dates hand-verified from public reporting.
      </footer>
    </div>
  );
}
