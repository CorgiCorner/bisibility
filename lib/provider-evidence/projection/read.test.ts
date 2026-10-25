import type { Prisma } from "@/lib/generated/prisma/client";
import { describe, expect, it, vi } from "vitest";
import { readCheckEvidence } from "./read";

vi.mock("server-only", () => ({}));
describe("DM-15 batched projection reader", () => {
  it("uses three batched reads for fifty checks and returns null for legacy rows", async () => {
    const checks = Array.from({ length: 50 }, (_, i) => ({
      id: `internal-${i}`,
      publicId: `check-${i}`,
      status: "failed",
      provider: "fixture",
      checkedAt: new Date("2026-10-23T06:00:00Z"),
      recoveryRestoredAt: null,
      recoveryProvenance: null,
      partialEvidence: [],
    }));
    const db = {
      rankCheck: { findMany: vi.fn(async () => checks) },
      providerDispatchIdentity: { findMany: vi.fn(async () => []) },
      providerRecoveryCandidate: { findMany: vi.fn(async () => []) },
    };
    const result = await readCheckEvidence(
      "authorized-project",
      { checkIds: checks.map((check) => check.publicId) },
      db as unknown as Prisma.TransactionClient,
    );
    expect(result.size).toBe(50);
    expect([...result.values()].every((value) => value === null)).toBe(true);
    for (const table of Object.values(db)) expect(table.findMany).toHaveBeenCalledTimes(1);
    expect(db.providerDispatchIdentity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: "authorized-project",
          rankCheckId: { in: checks.map((check) => check.id) },
        },
      }),
    );
  });
});
