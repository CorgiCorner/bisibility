import { describe, expect, it } from "vitest";
import { connectionRates } from "./rates";
import type { StoredUiConnection } from "./state";

const hosted: StoredUiConnection = {
  id: "internal",
  publicId: "public",
  provider: "dataforseo",
  status: "connected",
  priority: 0,
  enabled: true,
  hasStoredCredentials: true,
  credentialSource: "hosted",
  providerUiRevision: "1",
  updatedAt: new Date("2026-10-01"),
  rates: [{ feature: "rank_check", amountCents: "9", updatedAt: "2026-10-01" }],
};

describe("hosted list-rate input to customer pricing", () => {
  it.each(["manual", "measured"])("excludes stored %s costs", (source) => {
    const row = {
      ...hosted,
      rates: source === "manual" ? hosted.rates : [],
    };
    const rate = connectionRates(row, false).find((entry) => entry.id === "rank_check");
    // The catalog's default 100-result check includes nine additional pages.
    expect(rate).toMatchObject({
      editable: false,
      fundingSource: "platform",
      price: { text: "2", certainty: "estimated" },
      provenance: { source: "list", origin: "catalog", sampleSize: null },
    });
    expect(rate).not.toHaveProperty("fallback");
  });
});

describe("own-key manual rate coefficients", () => {
  it("does not turn pooled legacy whole-call samples into an editable price", () => {
    const legacy = {
      ...hosted,
      credentialSource: "own" as const,
      rates: [],
      samples: Array.from({ length: 5 }, () => ({
        feature: "rank_check",
        costCents: "7",
        unitCostCents: null,
        createdAt: "2026-10-01",
      })),
    };
    const rate = connectionRates(legacy, true).find((row) => row.id === "rank_check");
    expect(rate).toMatchObject({
      price: { text: "", certainty: "unknown" },
      provenance: { source: "unknown", sampleSize: null },
      editable: true,
    });
  });

  it("retains an explicit zero without claiming one fallback for every request variant", () => {
    const rate = connectionRates(
      {
        ...hosted,
        credentialSource: "own",
        rates: [{ feature: "rank_check", amountCents: "0", updatedAt: "2026-10-01" }],
      },
      true,
    ).find((row) => row.id === "rank_check");
    expect(rate).toMatchObject({ price: { text: "0" }, provenance: { source: "manual" } });
    expect(rate).not.toHaveProperty("fallback");
  });
});
