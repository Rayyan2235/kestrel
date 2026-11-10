import { InsightsSchema, type Insights } from "@kestrel/contracts";

// The owner insights page's one request. The token is sent as a Bearer
// header and never stored: the owner pastes it each visit.

export type InsightsResult =
  | { ok: true; insights: Insights }
  | { ok: false; message: string };

const MESSAGES: Record<number, string> = {
  401: "That token is not right.",
  503: "Insights are off on this server: it has no owner token or no database.",
};

export async function loadInsights(token: string, fetcher: typeof fetch = fetch): Promise<InsightsResult> {
  try {
    const response = await fetcher("/api/owner/insights", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { ok: false, message: MESSAGES[response.status] ?? `Could not load insights (HTTP ${response.status}).` };
    return { ok: true, insights: InsightsSchema.parse(await response.json()) };
  } catch {
    return { ok: false, message: "Could not load insights. Check the connection and try again." };
  }
}

export const percent = (x: number) => `${Math.round(x * 100)}%`;
