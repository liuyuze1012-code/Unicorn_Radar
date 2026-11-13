import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/brand/Logo";

const active = { className: "font-medium text-foreground underline underline-offset-4" };

export function SiteHeader() {
  return (
    <header className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-b bg-background/80 px-5 py-3 backdrop-blur">
      <Link to="/" className="flex items-center gap-2 font-serif text-lg font-semibold"><Logo size={26} />Unicorn Radar</Link>
      <nav className="flex gap-5 text-sm text-muted-foreground">
        <Link to="/scorecard" search={{}} activeProps={active}>Scorecard</Link>
        <Link to="/map" search={{}} activeProps={active}>Comparables Map</Link>
        <Link to="/lessons" search={{}} activeProps={active}>Unicorn Lessons</Link>
        <Link to="/saved" activeProps={active}>Saved</Link>
      </nav>
    </header>
  );
}
