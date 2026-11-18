import { withProviderCredentialDefaults } from "@/lib/api/provider-credential-defaults";
import { providerCredentialFieldsFor } from "@/lib/integrations/credential-fields";
import { providerAllocationMetadata as historicalAllocation } from "@/lib/providers/allocation-metadata";
import { PROVIDER_CATALOG } from "@/lib/providers/catalog-metadata";
import { providerCredentialRequirementMessage } from "@/lib/providers/credential-requirements";
import {
  resolveProviderCredentials,
  resolveProviderCredentialsWithOverrides,
} from "@/lib/providers/credentials";
import { providerAllocationMetadata } from "@/lib/providers/runtime-allocation-metadata";
import { providerIdSchema } from "@/lib/schemas/provider";
import { expect, it, vi } from "vitest";
import { NATIVE_MODEL_PROVIDERS } from "./types";

it.each(NATIVE_MODEL_PROVIDERS)("registers %s as an API-key-only model integration", (id) => {
  expect(providerIdSchema.parse(id)).toBe(id);
  const item = PROVIDER_CATALOG.find((entry) => entry.id === id);
  expect(item).toMatchObject({
    id,
    kind: "model",
    requiredCredentials: ["apiKey"],
    billingNotice: "Billed by your provider",
    defaultStatus: "ready",
    accountUrl: expect.stringMatching(/^https:\/\//),
  });
  if (!item) throw new Error("Missing model catalog item");
  expect(providerCredentialRequirementMessage(item, {})).toContain("requires an API key");
  expect(providerCredentialRequirementMessage(item, { apiKey: "fixture-key" })).toBeNull();
  expect(providerCredentialFieldsFor(id, { connected: false })).toEqual([
    { label: "API key", name: "secret", placeholder: "Your private API key", type: "password" },
  ]);
  expect(providerCredentialFieldsFor(id, { connected: true })[0]).toMatchObject({
    name: "secret",
    placeholder: "••••••••",
    type: "password",
  });
  expect(providerAllocationMetadata(id)).toEqual({
    allocationUnit: "cents",
    billing: "metered",
    kind: "billable",
    quotaReset: "none",
  });
  expect(historicalAllocation(id)).toBeNull();
});

it("preserves every legacy ID and SERP catalog ordering", () => {
  for (const id of [
    "ahrefs",
    "dataforseo",
    "serpapi",
    "local-sequence",
    "gsc",
    "pagespeed",
    "ga4",
    "plausible",
  ])
    expect(providerIdSchema.parse(id)).toBe(id);
  expect(PROVIDER_CATALOG.filter((item) => item.kind === "serp").map((item) => item.id)).toEqual([
    "dataforseo",
    "serpapi",
  ]);
});

// Expectations transcribed from 827d7de374ca11160c1892e36beab4b735bb06ab.
it.each([
  [
    "dataforseo",
    { allocationUnit: "cents", billing: "metered", kind: "billable", quotaReset: "none" },
  ],
  [
    "serpapi",
    { allocationUnit: "units", billing: "quota", kind: "billable", quotaReset: "billing_cycle" },
  ],
  ...["ahrefs", "pagespeed", "gsc", "ga4", "plausible", "local-sequence"].map(
    (id) => [id, { kind: "non_billable" }] as const,
  ),
  [null, null],
  [undefined, null],
  ["unknown", null],
] as const)("preserves base allocation for %s", (id, expected) => {
  expect(providerAllocationMetadata(id)).toEqual(expected);
});

it.each(NATIVE_MODEL_PROVIDERS)(
  "%s never injects environment or project credential defaults",
  async (id) => {
    vi.stubEnv("OPENAI_API_KEY", "fixture-env-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "fixture-env-key");
    vi.stubEnv("OPENROUTER_API_KEY", "fixture-env-key");
    vi.stubEnv("AI_GATEWAY_API_KEY", "fixture-env-key");
    try {
      expect(resolveProviderCredentials(id, null)).toEqual({});
      expect(resolveProviderCredentialsWithOverrides(id, null, {})).toEqual({});
      const findUnique = vi.fn();
      const item = PROVIDER_CATALOG.find((item) => item.id === id);
      if (!item) throw new Error("Missing model catalog item");
      expect(
        await withProviderCredentialDefaults(item, "fixture-project", { apiKey: "fixture-key" }, {
          project: { findUnique },
        } as never),
      ).toEqual({ apiKey: "fixture-key" });
      expect(findUnique).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  },
);
