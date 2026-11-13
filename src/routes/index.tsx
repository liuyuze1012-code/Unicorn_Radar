import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/atlas", search: {} });
  },
  head: () => ({
    meta: [
      { title: "Unicorn Radar" },
      { name: "description", content: "See which real unicorns your company looked like at its Series A." },
      { property: "og:title", content: "Unicorn Radar" },
      { property: "og:description", content: "See which real unicorns your company looked like at its Series A." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
