import { Link } from "@tanstack/react-router";

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between border-b px-4 py-3">
      <Link to="/" className="font-serif text-lg font-semibold">Unicorn Radar</Link>
      <nav className="flex gap-4 text-sm">
        <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: "font-medium underline underline-offset-4" }}>Scorecard</Link>
        <Link to="/map" search={{}} activeProps={{ className: "font-medium underline underline-offset-4" }}>Comparables Map</Link>
      </nav>
    </header>
  );
}
