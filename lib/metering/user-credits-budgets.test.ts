import { platformAllocationTag } from "@/lib/metering/paid-quote";
import { fundingSpendingBudgets } from "@/lib/metering/spending-limits";
import type { Budget } from "@usagekit/core";
import { createMeter } from "@usagekit/meter";
import { createManualClock, createMemoryStore } from "@usagekit/store";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connections: vi.fn(),
  runtime: vi.fn(),
  evidence: vi.fn(),
  read: vi.fn(),
  owner: vi.fn(),
}));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.auth }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    providerConnection: { findMany: mocks.connections },
    project: { findUnique: mocks.owner },
    $executeRaw: vi.fn(),
    $transaction: async (fn: (tx: unknown) => unknown) => {
      const { prisma } = await import("@/lib/db/prisma");
      return fn(prisma);
    },
  },
}));
vi.mock("./runtime", () => ({ meteringNamespace: () => "n", meteringRuntime: mocks.runtime }));
vi.mock("./project-budget-read", () => ({ projectFundingStatuses: async () => [] }));
vi.mock("./own-budget-read", () => ({ readOwnConnectionBudgets: async () => null }));
vi.mock("@/lib/provider-ui/allocation-extension", () => ({
  platformAllocationEvidence: mocks.evidence,
  platformAllocationProviders: async () => ["dataforseo", "serpapi"],
}));
vi.mock("./spending-limit-store", () => ({ readSpendingBudgets: mocks.read }));

import { getProjectMeteringBudgets } from "./user-data";

const publicId = "conn_abcdefghijklmnopqrstuvwx";
let budgets: Budget[];
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime("2026-10-06T12:00:00Z");
  mocks.owner.mockResolvedValue({ ownerId: "owner" });
  mocks.auth.mockResolvedValue({
    actor: { id: "owner", role: "member", memberships: [{ projectId: "project", role: "owner" }] },
    project: { id: "project", ownerId: "owner", name: "Example" },
  });
  mocks.connections.mockResolvedValue([
    {
      id: "private-connection",
      publicId,
      projectId: "project",
      provider: "dataforseo",
      credentialSource: "hosted",
    },
  ]);
  budgets = fundingSpendingBudgets(
    "n",
    {
      id: "private-connection",
      provider: "dataforseo",
      unit: "cents",
      app: "100",
      programmatic: "500",
    },
    "platform",
    1,
  );
  mocks.read.mockImplementation(async () => budgets);
  mocks.evidence.mockResolvedValue(
    ["app", "programmatic"].map((surface) => ({
      connectionId: "private-connection",
      surface,
      used: { text: "12.5", unit: "customer_cents", certainty: "measured" },
      reserved: { text: "2.5", unit: "customer_cents", certainty: "measured" },
      available: { text: "1000", unit: "customer_cents", certainty: "measured" },
    })),
  );
});
afterEach(() => vi.useRealTimers());
async function usage() {
  const clock = createManualClock("2026-10-06T12:00:00Z");
  const store = createMemoryStore({ clock, budgets });
  mocks.runtime.mockResolvedValue({ meter: createMeter({ store, clock }), store, clock });
  return getProjectMeteringBudgets("prj_example");
}
it.each(["dataforseo", "serpapi"])(
  "shows both %s credits budgets with customer spend and public labels",
  async (provider) => {
    mocks.connections.mockResolvedValue([
      {
        id: "private-connection",
        publicId,
        projectId: "project",
        provider,
        credentialSource: "hosted",
      },
    ]);
    budgets = budgets.map((budget) => ({
      ...budget,
      scope: {
        kind: "tag",
        namespace: "n",
        tag: platformAllocationTag(provider, "private-connection"),
      },
    }));
    const data = await usage();
    expect(data.budgets).toHaveLength(2);
    expect(data.budgets[0]).toMatchObject({
      id: `${publicId}:app:customer_cents`,
      kind: "connection",
      used: { text: "12.5", unit: "customer_cents" },
      reserved: { text: "2.5" },
      remaining: { text: "85" },
      display: {
        projectName: "Example",
        providerLabel: provider === "serpapi" ? "SerpApi" : "DataForSEO",
      },
    });
    expect(JSON.stringify(data)).not.toMatch(/private-connection|platform:|owner/);
  },
);
it("keeps unknown evidence unavailable while retaining the credits limits", async () => {
  mocks.evidence.mockResolvedValue([]);
  const data = await usage();
  expect(data.budgets).toHaveLength(2);
  expect(data.budgets[0]).toMatchObject({
    used: "unavailable",
    reserved: "unavailable",
    remaining: "unavailable",
    limit: { text: "100" },
  });
});
it.each(["own", "other-project", "wrong-unit", "shared-tag", "wrong-id", "wrong-window"])(
  "rejects %s bindings",
  async (scenario) => {
    if (scenario === "own" || scenario === "other-project")
      mocks.connections.mockResolvedValue([
        {
          id: "private-connection",
          publicId,
          projectId: scenario === "other-project" ? "elsewhere" : "project",
          provider: "dataforseo",
          credentialSource: scenario === "own" ? "own" : "hosted",
        },
      ]);
    if (scenario === "wrong-unit")
      budgets = budgets.map((b) => ({ ...b, unit: "cents", limit: null }));
    if (scenario === "shared-tag")
      budgets = budgets.map((b) => ({
        ...b,
        scope: { kind: "tag", namespace: "n", tag: "shared" },
      }));
    if (scenario === "wrong-id")
      budgets = budgets.map((b) => ({ ...b, id: `unrelated:${b.surface}` }));
    if (scenario === "wrong-window")
      budgets = budgets.map((b) => ({
        ...b,
        window: { kind: "since_reset", epoch: "other", startsAt: "2026-10-01T00:00:00Z" },
      }));
    expect((await usage()).budgets).toEqual([]);
  },
);
it.each(["member", "admin", "viewer", "auditor"])(
  "does not read credits evidence for %s",
  async (role) => {
    mocks.auth.mockResolvedValue({
      actor: { id: "member", memberships: [{ projectId: "project", role }] },
      project: { id: "project", ownerId: "owner" },
    });
    expect(await usage()).toMatchObject({ status: "restricted", budgets: [] });
    expect(mocks.evidence).not.toHaveBeenCalled();
  },
);
it("does not expose foreign, uncertain or wrong-unit evidence", async () => {
  for (const change of [
    { connectionId: "foreign" },
    { used: { text: "999", certainty: "unknown", unit: "customer_cents" } },
    { reserved: { text: "999", certainty: "measured", unit: "cents" } },
  ]) {
    const evidence = await mocks.evidence();
    mocks.evidence.mockResolvedValue(evidence.map((e: object) => ({ ...e, ...change })));
    expect((await usage()).budgets.every((row) => row.used === "unavailable")).toBe(true);
  }
});

it("rechecks ownership inside the financial evidence snapshot", async () => {
  mocks.owner.mockResolvedValue({ ownerId: "new-owner" });
  expect((await usage()).budgets).toEqual([]);
  expect(mocks.evidence).not.toHaveBeenCalled();
});
it("shows proven zero customer charges before the first operation", async () => {
  const proof = await mocks.evidence();
  mocks.evidence.mockResolvedValue(
    proof.map((entry: object) => ({
      ...entry,
      used: { text: "0", unit: "customer_cents", certainty: "measured" },
      reserved: { text: "0", unit: "customer_cents", certainty: "measured" },
    })),
  );
  expect((await usage()).budgets[0]).toMatchObject({
    used: { text: "0" },
    reserved: { text: "0" },
    remaining: { text: "100" },
    level: "ok",
  });
});
