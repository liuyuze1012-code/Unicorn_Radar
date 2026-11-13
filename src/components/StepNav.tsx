import { Link } from "@tanstack/react-router";
import type { CompanySearch } from "@/lib/companyParams";

/** Scorecard → Comparables Map → Unicorn Lessons, carrying the company along. */
export function StepNav({ current, search }: { current: 1 | 2 | 3; search: CompanySearch & { id?: number | undefined } }) {
  const { id, ...company } = search;
  const steps = [
    { n: 1, label: "Scorecard", el: (c: string) => <Link to="/scorecard" search={company} className={c}>1 · Scorecard</Link> },
    { n: 2, label: "Comparables Map", el: (c: string) => <Link to="/map" search={id !== undefined ? { id } : company} className={c}>2 · Comparables Map</Link> },
    { n: 3, label: "Unicorn Lessons", el: (c: string) => <Link to="/lessons" search={search} className={c}>3 · Unicorn Lessons</Link> },
  ] as const;
  return (
    <nav aria-label="Steps" className="flex flex-wrap items-center gap-1 text-xs">
      {steps.map((s, i) => (
        <span key={s.n} className="flex items-center gap-1">
          {s.el(`rounded-full border px-2.5 py-1 ${s.n === current ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`)}
          {i < 2 && <span className="text-muted-foreground">→</span>}
        </span>
      ))}
    </nav>
  );
}
