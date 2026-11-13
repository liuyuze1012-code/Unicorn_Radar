import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { parseCompanySearch, type CompanySearch } from "@/lib/companyParams";
import { CATEGORIES, type Category } from "@/lib/scoring";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/scorecard/new")({
  validateSearch: parseCompanySearch,
  head: () => ({
    meta: [
      { title: "Enter company information · Unicorn Radar" },
      { name: "description", content: "Enter a company's Series A facts to score it against 5,819 historical companies." },
      { property: "og:title", content: "Enter company information · Unicorn Radar" },
      { property: "og:description", content: "Enter a company's Series A facts to score it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewCompany,
});

const CAT_TEXT: Record<Category, string> = {
  "B2B software": "Software sold to businesses",
  "B2C software": "Apps and sites for consumers",
  Hardware: "Physical devices and electronics",
  Other: "Biotech, health, clean energy",
};

type Form = Record<"name" | "a" | "pe" | "pr" | "m" | "age" | "inv" | "st", string>;
const str = (v: number | undefined, div = 1) => (v === undefined ? "" : String(+(v / div).toFixed(3)));
const n = (v: string, mult = 1) => (v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) * mult : undefined);

function NewCompany() {
  const s = Route.useSearch();
  const navigate = useNavigate();
  const [cat, setCat] = useState<Category>(s.cat ?? "B2B software");
  const [f, setF] = useState<Form>({
    name: s.name ?? "", a: str(s.a, 1e6), pe: str(s.pe, 1e6), pr: str(s.pr), m: str(s.m), age: str(s.age), inv: str(s.inv), st: s.st ?? "",
  });
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const field = (k: keyof Form, label: string, help: string, unit?: string) => (
    <label className="block">
      <span className="font-medium">{label}</span>
      <span className="block text-sm text-muted-foreground">{help}</span>
      <span className="mt-2 flex items-center rounded-lg border bg-card focus-within:ring-2 focus-within:ring-ring">
        <input value={f[k]} onChange={set(k)} inputMode={k === "name" || k === "st" ? "text" : "decimal"} className="num h-12 w-full rounded-lg bg-transparent px-3 outline-none" />
        {unit && <span className="pr-3 text-sm text-muted-foreground">{unit}</span>}
      </span>
    </label>
  );
  const submit = () => {
    const out: CompanySearch = {
      name: f.name.trim() || undefined, cat,
      a: n(f.a, 1e6), pe: n(f.pe, 1e6), pr: n(f.pr), m: n(f.m), age: n(f.age), inv: n(f.inv),
      st: f.st.trim() ? f.st.trim().toUpperCase().slice(0, 2) : undefined,
    };
    navigate({ to: "/scorecard", search: out });
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="text-4xl sm:text-5xl">Enter company information</h1>
        <p className="mt-3 text-lg text-muted-foreground">Facts as of the company's first Series A. Leave anything you don't know blank.</p>
        <Tabs defaultValue="form" className="mt-8">
          <TabsList>
            <TabsTrigger value="form">Fill in the form</TabsTrigger>
            <TabsTrigger value="deck">Upload a pitch deck</TabsTrigger>
          </TabsList>
          <TabsContent value="form" className="mt-6 space-y-8">
            {field("name", "Company name", "Shown on the scorecard and the map.")}
            <fieldset>
              <legend className="font-medium">Category</legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {CATEGORIES.map((c) => (
                  <button type="button" key={c} onClick={() => setCat(c)} aria-pressed={cat === c}
                    className={cn("rounded-xl border bg-card p-4 text-left transition-colors", cat === c ? "border-foreground ring-1 ring-foreground" : "hover:border-muted-foreground")}>
                    <div className="font-serif text-lg">{c}</div>
                    <div className="text-sm text-muted-foreground">{CAT_TEXT[c]}</div>
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-6 sm:grid-cols-2">
              {field("a", "Series A amount", "Size of the first Series A round.", "$M")}
              {field("pe", "Equity raised before Series A", "Angel, seed and similar rounds combined.", "$M")}
              {field("pr", "Rounds before Series A", "Number of earlier equity rounds.", "rounds")}
              {field("m", "Time from first funding to Series A", "From the first recorded round.", "months")}
              {field("age", "Company age at Series A", "From founding to the Series A.", "months")}
              {field("inv", "Investors in the Series A", "Firms and individuals in the round.", "investors")}
              {field("st", "HQ state", "Two-letter U.S. state code, e.g. CA.")}
            </div>
            <Button size="lg" className="h-14 w-full text-base" onClick={submit}>Score this company →</Button>
          </TabsContent>
          <TabsContent value="deck" className="mt-6">
            <div className="rounded-2xl border border-dashed bg-card px-8 py-14 text-center">
              <h2 className="text-2xl">Coming soon</h2>
              <p className="mt-2 text-muted-foreground">Uploading a pitch deck to fill in the form automatically isn't available yet. Use the form for now.</p>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
