import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getHistoricalCompanies } from "@/lib/comparables";
import { parseCompanySearch, toCompanyInput, type CompanySearch } from "@/lib/companyParams";
import { closestUnicorns, takeaways } from "@/lib/lessons";
import { writeUnicornStories } from "@/lib/lessons.functions";
import { formatUsd, stageLabel } from "@/lib/mapModel";
import type { CompanyInput } from "@/lib/scoring";
import { SiteHeader } from "@/components/SiteHeader";
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
      { name: "description", content: "See the unicorns most like your company, how you compare, and what you can learn from them." },
      { property: "og:title", content: "Unicorn Lessons · Unicorn Radar" },
      { property: "og:description", content: "The 5 closest historical unicorns to your company and the lessons to copy." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LessonsPage,
});

function Stories({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm">
      {text.split("\n").map((l, i) => {
        const t = l.trim();
        if (!t) return null;
        if (t.startsWith("## ")) return <h3 key={i} className="pt-4 text-lg">{t.slice(3)}</h3>;
        if (/^[-*] /.test(t)) return <p key={i} className="pl-4 before:-ml-4 before:mr-2 before:content-['•']">{t.slice(2).replace(/\*\*/g, "")}</p>;
        return <p key={i}>{t.replace(/\*\*/g, "")}</p>;
      })}
    </div>
  );
}

function LessonsPage() {
  const search = Route.useSearch();
  const all = useMemo(() => getHistoricalCompanies(), []);
  const write = useServerFn(writeUnicornStories);
  const [stories, setStories] = useState<{ text?: string; error?: string; loading?: boolean }>({});

  const focus = useMemo((): { input: CompanyInput; name: string; excludeId?: number } | null => {
    if (search.id !== undefined && all[search.id]) { const c = all[search.id]!; return { input: c, name: c.name, excludeId: c.id }; }
    if (search.cat) return { input: toCompanyInput({ ...search, cat: search.cat }), name: search.name || "Your company" };
    return null;
  }, [search, all]);
  const unicorns = useMemo(() => (focus ? closestUnicorns(focus.input, 5, focus.excludeId) : []), [focus]);
  const rows = useMemo(() => (focus ? takeaways(focus.input, unicorns.map((u) => u.company)) : []), [focus, unicorns]);
  const { id: _id, ...companySearch } = search;

  const run = async () => {
    if (!focus) return;
    setStories({ loading: true });
    const r = await write({ data: { name: focus.name, input: focus.input, ids: unicorns.map((u) => u.company.id) } }).catch(() => ({ error: "Couldn't write the stories right now. Please try again later." }));
    setStories("text" in r ? { text: r.text } : { error: r.error });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 space-y-10 px-5 py-8">
        {!focus ? (
          <div className="space-y-4 py-16 text-center">
            <h1 className="text-3xl">No company yet</h1>
            <p className="text-muted-foreground">Score a company first to see the unicorns most like it.</p>
            <Button asChild><Link to="/scorecard/new" search={{}}>Score a company</Link></Button>
          </div>
        ) : (
          <>
            <header className="space-y-2">
              <h1 className="text-3xl">Unicorn Lessons for {focus.name}</h1>
              <p className="text-muted-foreground">The 5 historical unicorns whose Series A looked most like yours, how you compare, and what they did next.</p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button asChild variant="outline" size="sm"><Link to="/map" search={search.id !== undefined ? { id: search.id } : companySearch}>← Back to Comparables Map</Link></Button>
              </div>
            </header>

            <section className="space-y-3">
              <h2 className="text-xl">1. The 5 closest unicorns</h2>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-left text-xs text-muted-foreground">
                    <tr><th className="p-2">Company</th><th className="p-2">Series A</th><th className="p-2">Raised at A</th><th className="p-2">Investors</th><th className="p-2">Within 3 years</th><th className="p-2">Hit $1B</th></tr>
                  </thead>
                  <tbody className="divide-y num">
                    <tr className="bg-accent/40 font-medium"><td className="p-2">{focus.name} (you)</td><td className="p-2">–</td><td className="p-2">{formatUsd(focus.input.seriesAAmountUsd)}</td><td className="p-2">{focus.input.seriesAInvestorCount ?? "unknown"}</td><td className="p-2">–</td><td className="p-2">–</td></tr>
                    {unicorns.map(({ company: c }) => (
                      <tr key={c.id}>
                        <td className="p-2">{c.name} <span className="text-xs text-muted-foreground">{c.category}</span></td>
                        <td className="p-2">{c.seriesADate}</td>
                        <td className="p-2">{formatUsd(c.seriesAAmountUsd)}</td>
                        <td className="p-2">{c.seriesAInvestorCount ?? "unknown"}</td>
                        <td className="p-2">{stageLabel(c.stage3y)}</td>
                        <td className="p-2">{c.firstBillionDate ?? "yes"}{c.unicorn === "later" ? " (after 5y)" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl">2. You vs. them, by the numbers</h2>
              <p className="text-sm text-muted-foreground">Your Series A profile against the middle value of these 5 unicorns.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {rows.map((r) => (
                  <div key={r.label} className="rounded-md border bg-card p-3 text-sm">
                    <div className="text-xs text-muted-foreground">{r.label}</div>
                    <div className="num mt-1 flex justify-between"><span>You: <strong>{r.yours}</strong></span><span>Them: <strong>{r.theirs}</strong></span></div>
                    <p className="mt-1 text-xs">{r.note}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3 rounded-lg border bg-card p-5">
              <h2 className="text-xl">3. What they did, and what you can copy</h2>
              <p className="text-sm text-muted-foreground">AI-written stories for these 5 unicorns only. AI can get facts wrong, so check anything important.</p>
              {!stories.text && <Button onClick={run} disabled={stories.loading}>{stories.loading ? "Writing stories… (about a minute)" : "Write the 5 success stories"}</Button>}
              {stories.error && <p className="text-sm text-destructive">{stories.error}</p>}
              {stories.text && <Stories text={stories.text} />}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
