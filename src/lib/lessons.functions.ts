import { createServerFn } from "@tanstack/react-start";
import { getHistoricalCompanies } from "./comparables";
import { formatUsd, stageLabel } from "./mapModel";
import type { CompanyInput } from "./scoring";

export const writeUnicornStories = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string; input: CompanyInput; ids: number[] }) => {
    if (!Array.isArray(d.ids) || d.ids.length > 5) throw new Error("Up to 5 companies");
    return d;
  })
  .handler(async ({ data }): Promise<{ text: string } | { error: string }> => {
    const all = getHistoricalCompanies();
    const cs = data.ids.map((id) => all[id]).filter((c) => c !== undefined);
    const i = data.input;
    const desc = (c: CompanyInput) => `category ${c.category}, HQ ${c.hqState ?? "?"}, Series A ${formatUsd(c.seriesAAmountUsd)}, equity before A ${formatUsd(c.priorEquityUsd)}, ${c.seriesAInvestorCount ?? "?"} Series A investors, age at A ${c.ageMonthsAtA === null ? "?" : (c.ageMonthsAtA / 12).toFixed(1) + " years"}`;
    const prompt = [
      `Our company "${data.name}": ${desc(i)}.`,
      "",
      "The 5 most similar historical companies (by Series A profile) that became unicorns:",
      ...cs.map((c) => `- ${c.name} (Series A ${c.seriesADate}; ${desc(c)}; within 3 years: ${stageLabel(c.stage3y)}; first $1B round ${c.firstBillionDate ?? "?"})`),
      "",
      "For each company write a section starting with '## <Company name>', then 3-4 bullets ('- ') on what it actually did after its Series A that made it successful (product, go-to-market, hiring, fundraising, timing). Use well-known public facts only; if you are unsure about a company, say so plainly instead of guessing.",
      "Then a final section '## What you can copy' with 4-6 concrete, actionable bullets for our company, drawn from patterns shared across these unicorns. Plain language for a VC investor. No other markdown.",
    ].join("\n");
    try {
      const { generateLessonsText } = await import("./aiGateway.server");
      const text = await generateLessonsText("You are a venture analyst who knows startup histories well and never invents facts.", prompt);
      if (!text.trim()) return { error: "The AI didn't return any stories. Please try again later." };
      return { text };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      console.error("stories failed", status, e);
      if (status === 402) return { error: "Out of AI credits. Add credits in Settings → Plans & credits." };
      if (status === 429) return { error: "Too many requests right now. Please wait a minute and try again." };
      return { error: "Couldn't write the stories right now. Please try again later." };
    }
  });
