/** Shared team list of checked companies and their saved unicorn stories. */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { savedKey } from "./savedKey";

export interface SavedCompany { id: string; key: string; name: string; search: Record<string, unknown>; stories: string | null; updated_at: string }

export async function listSaved(): Promise<SavedCompany[]> {
  const { data, error } = await supabase.from("saved_companies").select("id,key,name,search,stories,updated_at").order("updated_at", { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []) as SavedCompany[];
}

export async function getSaved(search: Record<string, unknown>): Promise<SavedCompany | null> {
  const { data } = await supabase.from("saved_companies").select("id,key,name,search,stories,updated_at").eq("key", savedKey(search)).maybeSingle();
  return (data as SavedCompany | null) ?? null;
}

/** Save (or refresh) a company; pass stories to keep them. */
export async function saveCompany(name: string, search: Record<string, unknown>, stories?: string) {
  const clean = JSON.parse(JSON.stringify(search)) as Json;
  const row = { key: savedKey(search), name: name.slice(0, 200) || "Unnamed company", search: clean, updated_at: new Date().toISOString(), ...(stories ? { stories } : {}) };
  const { error } = await supabase.from("saved_companies").upsert(row, { onConflict: "key" });
  if (error) console.error("save failed", error);
}

export async function deleteSaved(id: string) {
  const { error } = await supabase.from("saved_companies").delete().eq("id", id);
  if (error) throw error;
}
