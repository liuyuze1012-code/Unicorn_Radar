import { Link } from "@tanstack/react-router";

const active = { className: "font-medium text-foreground underline underline-offset-4" };

export function SiteHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
      <Link to="/atlas" search={{}} className="font-serif text-lg font-semibold">Unicorn Radar</Link>
      <nav className="flex gap-4 text-sm text-muted-foreground">
        <Link to="/atlas" search={{}} activeProps={active}>Atlas</Link>
        <Link to="/scorecard" activeProps={active}>Scorecard</Link>
        <Link to="/map" search={{}} activeProps={active}>Comparables Map (Advanced)</Link>
      </nav>
    </header>
  );
}
