import { useState } from "react";
import { Button } from "@/components/ui/button";
import { monthsBetween, type Category } from "@/lib/scoring";
import { cn } from "@/lib/utils";

export interface AtlasAnswers {
  cat: Category;
  a?: number | undefined;
  inv?: number | undefined;
  age?: number | undefined;
  pe?: number | undefined;
  st?: string | undefined;
  name?: string | undefined;
}

const CARDS: { cat: Category; title: string; sub: string }[] = [
  { cat: "B2B software", title: "Software for businesses", sub: "Tools, platforms and services other companies pay for" },
  { cat: "B2C software", title: "App or website for consumers", sub: "Products people use in their everyday lives" },
  { cat: "Hardware", title: "A physical device", sub: "Gadgets, electronics and machines" },
  { cat: "Other", title: "Biotech, health or energy", sub: "Medicine, life sciences and clean tech" },
];

export const US_STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");

const toDate = (ym: string) => (/^\d{4}-\d{2}$/.test(ym) ? new Date(`${ym}-01T00:00:00Z`) : null);
const millions = (s: string) => (s.trim() && Number(s) > 0 ? Number(s) * 1e6 : undefined);

const inputCls = "h-14 w-full rounded-xl border bg-card px-4 text-xl";

export function Questions({ onDone }: { onDone: (a: AtlasAnswers) => void }) {
  const [step, setStep] = useState(0);
  const [cat, setCat] = useState<Category | null>(null);
  const [aDate, setADate] = useState("");
  const [amount, setAmount] = useState("");
  const [inv, setInv] = useState<number | null>(3);
  const [founded, setFounded] = useState("");
  const [prior, setPrior] = useState("");
  const [st, setSt] = useState("");

  const finish = (stateOverride?: string) => {
    const age = monthsBetween(toDate(founded), toDate(aDate));
    const state = stateOverride ?? st;
    onDone({
      cat: cat ?? "B2B software",
      a: millions(amount),
      inv: inv ?? undefined,
      age: age !== null && age >= 0 ? Math.round(age) : undefined,
      pe: millions(prior),
      st: state || undefined,
    });
  };
  const next = () => (step === 5 ? finish() : setStep(step + 1));

  const steps = [
    {
      q: "What does your company make?",
      body: (
        <div className="grid gap-3 sm:grid-cols-2">
          {CARDS.map((c) => (
            <button
              key={c.cat}
              onClick={() => { setCat(c.cat); setStep(1); }}
              className={cn("rounded-2xl border bg-card p-5 text-left transition-colors hover:border-foreground", cat === c.cat && "border-foreground")}
            >
              <div className="font-serif text-xl">{c.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{c.sub}</div>
            </button>
          ))}
        </div>
      ),
      skip: () => { setCat(null); setStep(1); },
      hideNext: true,
    },
    {
      q: "When did you raise your Series A, and how much?",
      body: (
        <div className="space-y-4">
          <label className="block"><span className="text-sm text-muted-foreground">Month and year</span>
            <input type="month" value={aDate} onChange={(e) => setADate(e.target.value)} className={inputCls} /></label>
          <label className="block"><span className="text-sm text-muted-foreground">Amount (in millions of dollars)</span>
            <input inputMode="decimal" placeholder="e.g. 5" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className={inputCls} /></label>
          <div className="flex flex-wrap gap-2">
            {[3, 5, 10, 20].map((v) => (
              <Button key={v} variant={amount === String(v) ? "default" : "outline"} className="h-11 rounded-full px-5" onClick={() => setAmount(String(v))}>${v}M</Button>
            ))}
          </div>
        </div>
      ),
      skip: () => { setADate(""); setAmount(""); setStep(2); },
    },
    {
      q: "How many investors joined that round?",
      body: (
        <div className="flex items-center justify-center gap-6">
          <Button variant="outline" className="size-14 rounded-full text-2xl" aria-label="Fewer" onClick={() => setInv(Math.max(1, (inv ?? 1) - 1))}>−</Button>
          <span className="num w-20 text-center text-5xl">{inv === null ? "?" : inv >= 10 ? "10+" : inv}</span>
          <Button variant="outline" className="size-14 rounded-full text-2xl" aria-label="More" onClick={() => setInv(Math.min(10, (inv ?? 0) + 1))}>+</Button>
        </div>
      ),
      skip: () => { setInv(null); setStep(3); },
    },
    {
      q: "When was the company founded?",
      body: (
        <label className="block"><span className="text-sm text-muted-foreground">Month and year</span>
          <input type="month" value={founded} onChange={(e) => setFounded(e.target.value)} className={inputCls} /></label>
      ),
      skip: () => { setFounded(""); setStep(4); },
    },
    {
      q: "How much did you raise before the Series A?",
      body: (
        <div className="space-y-4">
          <label className="block"><span className="text-sm text-muted-foreground">Amount (in millions of dollars), from angels, seed rounds and similar</span>
            <input inputMode="decimal" placeholder="e.g. 1.5" value={prior} onChange={(e) => setPrior(e.target.value.replace(/[^\d.]/g, ""))} className={inputCls} /></label>
          <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => { setPrior(""); setStep(5); }}>I'm not sure</Button>
        </div>
      ),
      skip: () => { setPrior(""); setStep(5); },
    },
    {
      q: "Where is your headquarters?",
      body: (
        <select aria-label="US state" value={st} onChange={(e) => setSt(e.target.value)} className={inputCls}>
          <option value="">Choose a state</option>
          {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      ),
      skip: () => { setSt(""); finish(""); },
    },
  ];
  const s = steps[step]!;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8 px-5 py-10">
      <div className="flex justify-center gap-2" aria-label={`Question ${step + 1} of ${steps.length}`}>
        {steps.map((_, i) => (
          <button key={i} aria-label={`Go to question ${i + 1}`} disabled={i > step} onClick={() => setStep(i)}
            className={cn("size-2.5 rounded-full", i === step ? "bg-foreground" : i < step ? "bg-muted-foreground" : "bg-border")} />
        ))}
      </div>
      <h1 className="text-center text-3xl leading-tight sm:text-4xl">{s.q}</h1>
      {s.body}
      <div className="flex flex-col gap-3">
        {!s.hideNext && (
          <Button className="h-14 rounded-xl text-lg" onClick={next}>{step === 5 ? "Show me my map" : "Next"}</Button>
        )}
        <div className="flex justify-between text-sm">
          {step > 0 ? <button className="text-muted-foreground underline" onClick={() => setStep(step - 1)}>Back</button> : <span />}
          <button className="text-muted-foreground underline" onClick={s.skip}>Skip / I don't know</button>
        </div>
      </div>
    </div>
  );
}
