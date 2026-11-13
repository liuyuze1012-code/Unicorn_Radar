import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseCompanySearch } from "@/lib/companyParams";
import { deleteSaved, listSaved } from "@/lib/savedCompanies";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/saved")({
  head: () => ({
    meta: [
      { title: "Saved companies · Unicorn Radar" },
      { name: "description", content: "Your team's checked companies and their saved unicorn stories." },
      { property: "og:title", content: "Saved companies · Unicorn Radar" },
      { property: "og:description", content: "Reopen companies your team already scored, with their 5 unicorn stories." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SavedPage,
});

function SavedPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["saved"], queryFn: listSaved });
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 py-10">
        <h1 className="text-3xl">Saved companies</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every company your team checks is saved here, with its unicorn stories once written. Everyone with the link sees this list.</p>
        {q.isLoading ? <p className="mt-8 text-sm text-muted-foreground">Loading…</p>
          : q.isError ? <p className="mt-8 text-sm text-destructive">Couldn't load saved companies. Please try again.</p>
          : !q.data?.length ? (
            <div className="mt-8 rounded-xl border bg-card p-8 text-center">
              <p className="text-muted-foreground">Nothing saved yet. Score a company and it will show up here.</p>
              <Button asChild className="mt-4"><Link to="/scorecard/new" search={{}}>Score a company</Link></Button>
            </div>
          ) : (
            <ul className="mt-6 divide-y rounded-xl border bg-card">
              {q.data.map((c) => {
                const s = c.search;
                const id = s["id"] !== undefined && Number.isFinite(Number(s["id"])) ? Number(s["id"]) : undefined;
                const company = parseCompanySearch(s);
                return (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {company.cat ?? "Historical company"} · checked {new Date(c.updated_at).toLocaleDateString()} · {c.stories ? "unicorn stories saved" : "no stories yet"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {id === undefined && company.cat && <Button asChild size="sm" variant="outline"><Link to="/scorecard" search={company}>Scorecard</Link></Button>}
                      <Button asChild size="sm"><Link to="/lessons" search={{ ...company, id }}>Unicorn Lessons</Link></Button>
                      <Button size="sm" variant="ghost" onClick={async () => { if (confirm(`Remove ${c.name}?`)) { await deleteSaved(c.id); void qc.invalidateQueries({ queryKey: ["saved"] }); } }}>Remove</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
      </main>
    </div>
  );
}
