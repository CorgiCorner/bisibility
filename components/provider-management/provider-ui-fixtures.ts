import type { UsageConnection } from "@/lib/metering/user-views";
import { fireEvent, screen, within } from "@testing-library/react";
import type {
  ProviderAllocationRow,
  ProviderBinding,
  ProviderConnection,
  ProviderRate,
} from "@usagekit/views";

export const providerUiBinding = (): ProviderBinding => ({
  scopeKey: `fixture:${crypto.randomUUID()}:project`,
  principalKey: "user_1",
  authRevision: "owner:active",
  canManage: true,
});

export const providerUiRate = (id = "keyword_research"): ProviderRate => ({
  id,
  label: id === "keyword_research" ? "Keyword research" : "Keyword metrics",
  operation: id,
  unit: "calls",
  priceUnit: "cents",
  price: { text: "1", unit: "cents", certainty: "measured" },
  fundingSource: "byok",
  editable: true,
  provenance: { source: "manual", origin: "host", checkedAt: null, sampleSize: null, version: "1" },
});

export const providerUiConnection = (id = "conn_data"): ProviderConnection => ({
  id,
  provider: "dataforseo",
  label: "DataForSEO",
  revision: "revision-1",
  fundingSource: "byok",
  enabled: true,
  priority: 0,
  fallbackChain: [],
  plan: null,
  status: { state: "connected" },
  availability: { state: "unknown" },
  freshness: { observedAt: null, stale: true, source: "unknown" },
  capabilities: ["rates"],
  hasStoredCredentials: true,
  rates: [
    providerUiRate(),
    {
      ...providerUiRate("keyword_metrics"),
      price: { text: "0", unit: "cents", certainty: "measured" },
      provenance: {
        source: "list",
        origin: "catalog",
        checkedAt: "2026-07-22T00:00:00.000Z",
        sampleSize: null,
        version: "list-1",
      },
    },
  ],
});

/** Opens a rate row from its summary button and scopes queries to that row. */
export async function openRateRow(label: string) {
  const summary = await screen.findByRole("button", { name: (name) => name.startsWith(label) });
  fireEvent.click(summary);
  const row = summary.closest("li");
  if (!row) throw new Error(`No rate row for ${label}`);
  return { summary, row: within(row) };
}

export const providerUiRow = (
  connectionId: string,
  surface: "app" | "programmatic",
  fundingSource: "byok" | "platform" = "byok",
): ProviderAllocationRow => ({
  id: `${connectionId}:${fundingSource}:${surface}`,
  connectionId,
  label: "DataForSEO",
  revision: "row-1",
  fundingSource,
  surface,
  unit: fundingSource === "platform" ? "customer_cents" : "cents",
  limit: "unavailable",
  unlimited: true,
  used: "unavailable",
  reserved: "unavailable",
  remaining: "unavailable",
  editable: true,
});

export function providerUiRows(connections: readonly UsageConnection[], platform = false) {
  return connections.flatMap((connection) =>
    (platform ? (["byok", "platform"] as const) : (["byok"] as const)).flatMap((source) =>
      (["app", "programmatic"] as const).map((surface) => {
        const amount = source === "byok" && connection.provider === "SerpApi" ? 1000 : undefined;
        const unit =
          source === "platform"
            ? "customer_cents"
            : connection.provider === "SerpApi"
              ? "units"
              : "cents";
        return {
          ...providerUiRow(connection.connectionId, surface, source),
          unit,
          unlimited: amount === undefined,
          limit:
            amount === undefined
              ? { text: "", unit, certainty: "unknown" as const }
              : { text: String(amount), unit, certainty: "measured" as const },
        };
      }),
    ),
  );
}
