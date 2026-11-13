/** Stable key for a checked company: same inputs → same saved entry. */
export function savedKey(search: Record<string, unknown>): string {
  const keys = Object.keys(search).filter((k) => search[k] !== undefined && search[k] !== null && search[k] !== "").sort();
  return keys.map((k) => `${k}=${String(search[k])}`).join("&");
}
