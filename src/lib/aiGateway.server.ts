import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

/** One-shot text call through Lovable AI Gateway (streamed, consumed server-side). */
export async function generateLessonsText(system: string, prompt: string): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw Object.assign(new Error("AI is not configured."), { statusCode: 401 });
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  let failure: unknown = null;
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    system,
    prompt,
    onError: ({ error }) => { failure = error; },
    providerOptions: { openai: { store: false, forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] } },
  });
  const text = await result.text;
  if (failure) throw failure;
  return text;
}
