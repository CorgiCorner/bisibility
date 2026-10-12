export const catalog = [
  {
    allocation: {
      allocationUnit: "cents",
      billing: "metered",
      kind: "billable",
      quotaReset: "none",
    },
    defaultStatus: "ready",
    id: "metered",
    kind: "serp",
    label: "Metered",
  },
  {
    allocation: {
      allocationUnit: "units",
      billing: "quota",
      kind: "billable",
      quotaReset: "billing_cycle",
    },
    defaultStatus: "ready",
    id: "quota",
    kind: "serp",
    label: "Quota",
  },
  {
    allocation: { kind: "non_billable" },
    defaultStatus: "optional",
    id: "analytics",
    kind: "analytics",
    label: "Analytics",
  },
] as const;

export function connection(
  id: string,
  provider: "metered" | "quota" | "analytics",
  overrides: Record<string, unknown> = {},
) {
  return {
    allocationAmountPerMonth: null,
    allocationUnit: null,
    costPerCheckCents: null,
    credentialSource: "own",
    rates: [],
    credentialsEncrypted: null,
    enabled: true,
    id,
    kind: provider === "analytics" ? "analytics" : "serp",
    programmaticAllocationAmountPerMonth: null,
    priority: 0,
    provider,
    publicId: `conn_${id}`,
    status: "connected",
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

export function project(
  connections: ReturnType<typeof connection>[],
  initialized: Date | null = new Date(),
) {
  return {
    budgetCapCents: 5_000,
    defaults: null,
    providerAllocationsInitializedAt: initialized,
    providerConnections: connections,
  };
}

/** Stored budget projections for spend presentation tests; independent from the legacy project cap. */
export function fixtureAllocations(connections: Record<string, unknown>[]) {
  return connections.map((c) => {
    const limit = (amount: unknown, unit: unknown = "cents") =>
      amount == null || unit == null ? null : { amountPerMonth: amount, unit };
    return {
      internalConnectionId: c.id,
      allocation: limit(c.allocationAmountPerMonth, c.allocationUnit),
      programmaticAllocation: limit(c.programmaticAllocationAmountPerMonth, c.allocationUnit),
      credits: {
        app: limit(c.creditsAllocationAmountPerMonth),
        programmatic: limit(c.creditsProgrammaticAllocationAmountPerMonth),
      },
      source:
        c.allocationAmountPerMonth != null || c.programmaticAllocationAmountPerMonth != null
          ? "connection"
          : "none",
    };
  });
}
