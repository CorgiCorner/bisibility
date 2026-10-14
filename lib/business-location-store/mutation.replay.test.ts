import { makePublicId } from "@/lib/db/public-id-resources";
import { expect, it, vi } from "vitest";
import { businessDigest } from "./canonical";
import type { BusinessDatabase, BusinessTransaction } from "./context";
import { mutateBusiness } from "./mutation";

const mocks = vi.hoisted(() => ({ scope: vi.fn(), audit: vi.fn() }));
vi.mock("./access", () => ({ businessProjectScope: mocks.scope }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
function setup() {
  const scope = { project: { id: "project" }, actor: { id: "writer" } };
  mocks.scope.mockResolvedValue(scope);
  const tx = {
    businessLocationMutation: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
  };
  const db = {
    $transaction: async (fn: (tx: BusinessTransaction) => Promise<unknown>) =>
      fn(tx as unknown as BusinessTransaction),
  } as BusinessDatabase;
  const execute = vi.fn().mockResolvedValue({
    receipt: {
      kind: "match",
      entityId: "business",
      publicId: "biz_invalid",
      decisionIds: ["decision"],
    },
    audit: {},
  });
  return { tx, db, execute, scope };
}
it("checks retained source after fresh authority and before retained receipt lookup", async () => {
  const { db, tx, execute } = setup(),
    order: string[] = [];
  mocks.scope.mockImplementation(async () => {
    order.push("fresh_authority");
    return { project: { id: "project" }, actor: { id: "writer" } };
  });
  tx.businessLocationMutation.findFirst.mockImplementation(async () => {
    order.push("receipt");
    return {
      actorId: "writer",
      bodyHash: businessDigest([
        "writer",
        "rematch_location",
        { projectId: "project", idempotencyKey: undefined },
      ]),
      result: {
        kind: "match",
        entityId: "business",
        publicId: makePublicId("biz"),
        decisionIds: ["decision"],
      },
    };
  });
  await expect(
    mutateBusiness({
      data: { projectId: "project", idempotencyKey: "key" },
      context: { actor: { id: "writer", memberships: [] } },
      operation: "rematch_location",
      db,
      execute,
      assertReplay: async () => {
        order.push("source_guard");
        throw new Error("source changed");
      },
    }),
  ).rejects.toThrow("source changed");
  expect(order).toEqual(["fresh_authority", "source_guard"]);
  expect(execute).not.toHaveBeenCalled();
  expect(tx.businessLocationMutation.findFirst).not.toHaveBeenCalled();
});
it("fresh revocation stops guard and idempotent return", async () => {
  const { db, tx, execute } = setup(),
    guard = vi.fn();
  mocks.scope.mockRejectedValue(new Error("revoked"));
  await expect(
    mutateBusiness({
      data: { projectId: "project", idempotencyKey: "key" },
      context: { actor: { id: "writer", memberships: [] } },
      operation: "rematch_location",
      db,
      execute,
      assertReplay: guard,
    }),
  ).rejects.toThrow("revoked");
  expect(guard).not.toHaveBeenCalled();
  expect(tx.businessLocationMutation.findFirst).not.toHaveBeenCalled();
});

it("keeps unguarded existing callers' body hash and successful idempotent receipt unchanged", async () => {
  const { db, tx, execute } = setup();
  const receipt = {
    kind: "match",
    entityId: "business",
    publicId: makePublicId("biz"),
    decisionIds: ["decision"],
  };
  tx.businessLocationMutation.findFirst.mockResolvedValue({
    actorId: "writer",
    bodyHash: businessDigest([
      "writer",
      "rematch_location",
      { projectId: "project", idempotencyKey: undefined },
    ]),
    result: receipt,
  });
  expect(
    await mutateBusiness({
      data: { projectId: "project", idempotencyKey: "key" },
      context: { actor: { id: "writer", memberships: [] } },
      operation: "rematch_location",
      db,
      execute,
    }),
  ).toEqual({ receipt, replayed: true });
  expect(execute).not.toHaveBeenCalled();
});
