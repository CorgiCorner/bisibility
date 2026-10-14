import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createManualClock, createMemoryStore } from "@usagekit/store";
import { afterEach, expect, test, vi } from "vitest";
import { fencePaidAttemptsInTransaction, markPaidAttemptDispatch } from "./paid-dispatch";
import { ref, request } from "./store/test-data";

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  operation: vi.fn(),
  reference: vi.fn(),
  intent: vi.fn(),
}));
vi.mock("./transaction-meter", () => ({
  createTransactionMeter: async () => ({ markDispatchIntent: mocks.intent }),
  readPaidOperation: mocks.operation,
}));
vi.mock("./paid-context", () => ({
  paidContext: mocks.context,
  lockPaidOperation: async () => {},
}));
vi.mock("./paid-binding", () => ({ verifyPaidBinding: async () => {} }));
vi.mock("./paid-fence-references", () => ({ readPaidFenceReference: mocks.reference }));

const clients: PrismaClient[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.$disconnect()));
  vi.restoreAllMocks();
});

async function fixture() {
  vi.resetAllMocks();
  const clock = createManualClock("2026-10-13T00:00:00.000Z");
  const store = createMemoryStore({ clock, budgets: [] });
  const reserved = await store.reserve(request("possible-send"));
  if (reserved.outcome !== "reserved") throw new Error("Expected a real Store reservation");
  const grant = await store.markDispatchIntent({
    ...ref(reserved.operation),
    expectedVersion: reserved.operation.version,
    holder: "worker",
    commandId: "first-intent",
    leaseTtlMs: 60000,
  });
  if (!("granted" in grant) || !grant.granted)
    throw new Error("Expected a real Store dispatch grant");
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: "postgresql://test:test@127.0.0.1:1/test" }),
  });
  clients.push(db);
  const context = {
    projectId: "project",
    connectionId: "c1",
    publicConnectionId: "pc_1",
    providerCredentialVersion: "v1",
    correlationId: "correlation",
  };
  vi.spyOn(db, "$queryRaw").mockResolvedValue([{ context }]);
  const writes = vi.spyOn(db, "$executeRaw").mockResolvedValue(0);
  mocks.operation.mockResolvedValue(grant.operation);
  mocks.reference.mockResolvedValue({ operation: grant.operation, lease: grant.lease, context });
  mocks.intent.mockResolvedValue({ granted: false, operation: grant.operation });
  // Legacy original possible-send time is unknown, but its presence is authoritative.
  mocks.context.mockResolvedValue({
    context,
    principal: "u1",
    dispatch_lease_id: grant.lease.leaseId,
    transportFenced: true,
    transportFenceProvenance: "legacy_unknown",
    transportFenceInstant: null,
    debit_id: null,
  });
  return { db, grant, clock, writes, context };
}

test("a canonical original possible-send presence cannot mint another dispatch intent", async () => {
  const f = await fixture();
  mocks.context.mockResolvedValueOnce({
    context: f.context,
    principal: "u1",
    dispatch_lease_id: null,
    transportFenced: true,
    transportFenceProvenance: "legacy_unknown",
    transportFenceInstant: null,
    debit_id: null,
  });
  await expect(
    markPaidAttemptDispatch(f.db, { operation: f.grant.operation, replayed: false }, "worker", {
      clock: f.clock,
    }),
  ).rejects.toThrow("intent already exists");
  expect(mocks.intent).not.toHaveBeenCalled();
  expect(f.writes).not.toHaveBeenCalled();
});

test("a canonical fenced grant cannot reach semantic approval or another possible-send write", async () => {
  const f = await fixture();
  const assertDispatch = vi.fn();
  await expect(
    fencePaidAttemptsInTransaction(f.db, [f.grant], {
      clock: f.clock,
      beforeFence: { lockBusiness: async () => {}, assertDispatch },
    }),
  ).rejects.toThrow("holder is fenced out");
  expect(assertDispatch).not.toHaveBeenCalled();
  expect(f.writes).not.toHaveBeenCalled();
});
