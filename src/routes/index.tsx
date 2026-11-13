import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { BarChart3, FileText, Radar } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { SiteHeader } from "@/components/SiteHeader";
import { ModelExplainer } from "@/components/ModelExplainer";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Unicorn Radar · How does a Series A company stack up?" },
      { name: "description", content: "See how a Series A company stacks up against 5,819 real startups, and which ones raised their next rounds or became unicorns." },
      { property: "og:title", content: "Unicorn Radar" },
      { property: "og:description", content: "Compare a Series A company against 5,819 real startups and their actual outcomes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

function DotField() {
  const dots = useMemo(() => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    return Array.from({ length: 306 }, (_, i) => ({ x: rnd() * 1640 - 20, y: rnd() * 940 - 20, r: 1.2 + rnd() * 1.6, gold: i % 51 === 0, d: rnd() * 3 }));
  }, []);
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <g className="radar-drift">
        {dots.map((d, i) =>
          d.gold ? (
            <circle key={i} cx={d.x} cy={d.y} r={4} className="fill-gold radar-pulse" style={{ animationDelay: `${d.d}s` }} />
          ) : (
            <circle key={i} cx={d.x} cy={d.y} r={d.r} className="fill-muted-foreground" opacity={0.18} />
          ),
        )}
      </g>
    </svg>
  );
}

const STATS = [
  { n: "5,819", t: "U.S. Series A companies, 2005–2013" },
  { n: "50", t: "unicorns, each verified against news sources" },
  { n: "8×", t: "more unicorns in the model's top 100 picks than random picks" },
];

const STEPS = [
  { icon: FileText, title: "Enter the company", body: "Type in its Series A facts, or upload a pitch deck." },
  { icon: BarChart3, title: "Get the forecast", body: "Odds of raising a Series B or C, and odds of a $1B round, compared with the historical average." },
  { icon: Radar, title: "Find its look-alikes", body: "See the company on a map of 5,819 real startups and what happened to the ones most like it." },
];

function Home() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <section className="relative flex min-h-[calc(100svh-57px)] items-center overflow-hidden px-6">
        <DotField />
        <div className="relative mx-auto w-full max-w-5xl py-20">
          <Logo size={88} animated className="mb-8" />
          <h1 className="text-6xl leading-[0.95] tracking-tight sm:text-8xl lg:text-[112px]">Unicorn Radar</h1>
          <p className="mt-8 max-w-2xl text-xl leading-relaxed text-muted-foreground sm:text-2xl">
            See how a Series A company stacks up against 5,819 real startups — and which ones went on to raise their next rounds or become unicorns.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-14 px-8 text-base"><Link to="/scorecard" search={{}}>Score a company →</Link></Button>
            <Button asChild size="lg" variant="outline" className="h-14 bg-background px-8 text-base"><Link to="/map" search={{}}>Explore the map</Link></Button>
          </div>
        </div>
      </section>

      <section className="border-y bg-card">
        <div className="mx-auto grid max-w-6xl divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {STATS.map((s) => (
            <div key={s.n} className="px-8 py-12">
              <div className="num text-6xl font-medium tracking-tight sm:text-7xl">{s.n}</div>
              <p className="mt-3 max-w-xs text-muted-foreground">{s.t}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-28">
        <h2 className="text-4xl sm:text-5xl">How it works</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-2xl border bg-card p-8">
              <s.icon className="size-8" strokeWidth={1.5} />
              <div className="num mt-8 text-sm text-muted-foreground">0{i + 1}</div>
              <h3 className="mt-1 text-2xl">{s.title}</h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-28">
        <h2 className="text-4xl sm:text-5xl">Built on real outcomes</h2>
        <p className="mt-6 text-xl leading-relaxed text-muted-foreground">
          Trained on real companies — including the ones that failed — and tested on later years the model never saw. We show uncertainty instead of hiding it.
        </p>
        <ModelExplainer />
      </section>

      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-20 sm:flex-row sm:items-center">
          <h2 className="text-4xl sm:text-5xl">Score your first company</h2>
          <Button asChild size="lg" variant="secondary" className="h-14 px-8 text-base"><Link to="/scorecard/new" search={{}}>Score your first company →</Link></Button>
        </div>
      </section>

      <footer className="px-6 py-8 text-sm text-muted-foreground">
        Data: Crunchbase 2013 snapshot (CC BY 4.0). Unicorn dates hand-verified from public reporting. Not investment advice.
      </footer>
    </div>
  );
}
