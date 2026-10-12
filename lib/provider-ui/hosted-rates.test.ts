import type { ProviderRate } from "@usagekit/views";
import { describe, expect, it, vi } from "vitest";
import { connectionView } from "./model";
import type { ProviderUiState, StoredUiConnection } from "./state";

vi.mock("./state", () => ({ connectionRevision: () => "revision" }));

const connection: StoredUiConnection = {
  id: "internal",
  publicId: "connection",
  provider: "dataforseo",
  status: "connected",
  priority: 0,
  enabled: true,
  hasStoredCredentials: true,
  credentialSource: "hosted",
  providerUiRevision: "1",
  updatedAt: new Date("2026-10-01"),
  rates: [{ feature: "rank_check", amountCents: "0", updatedAt: "2026-10-01" }],
};
const customerRate: ProviderRate = {
  id: "rank_check",
  label: "Rank checks",
  operation: "rank_check",
  unit: "check",
  priceUnit: "cents",
  price: { text: "0.3250", unit: "cents", certainty: "estimated" },
  fundingSource: "platform",
  editable: false,
  provenance: { source: "list", origin: "host", checkedAt: null, sampleSize: null, version: null },
};
function state(platformRates: Record<string, ProviderRate[]> = {}): ProviderUiState {
  return { binding: { canManage: true }, platformRates } as unknown as ProviderUiState;
}

describe("customer price projection", () => {
  it("supplies hosted customer prices instead of catalog prices or stored manual rates", () => {
    const view = connectionView(state({ connection: [customerRate] }), connection);
    expect(view.rates).toEqual([customerRate]);
    expect(view.capabilities).not.toContain("rates");
  });
  it("never falls back to provider list prices when customer prices are unavailable", () => {
    expect(connectionView(state(), connection).rates).toEqual([]);
  });
  it("leaves BYOK manual rates and native fallback unchanged", () => {
    const view = connectionView(state({ connection: [customerRate] }), {
      ...connection,
      credentialSource: "own",
    });
    expect(view.rates.find((rate) => rate.id === "rank_check")).toMatchObject({
      price: { text: "0" },
      editable: true,
      fundingSource: "byok",
      provenance: { source: "manual", origin: "host" },
    });
  });
});
