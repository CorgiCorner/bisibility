import type { PublicIdMigrationDatabase } from "@/lib/public-id-migrator/types";
import { describe, expect, it, vi } from "vitest";
import { backfillPostReleasePublicIdLedger } from "./post-release-ledger";

const context = {
  phase: "public-id-v3-n1" as const,
  releasePolicy: "operator" as const,
  targetAppRelease: "b".repeat(40),
};

function blockedN1Gate() {
  return {
    blocked: true,
    phase: "public-id-v3-n1",
    releasePolicy: "operator",
    releasedAppRelease: null,
    releasedAt: null,
    targetAppRelease: context.targetAppRelease,
  };
}

describe("post-release public ID ledger compatibility", () => {
  it("reserves only strict rows missing from the release N ledger", async () => {
    let sessionBatchRead = false;
    const query = vi.fn<PublicIdMigrationDatabase["query"]>(async (sql, values) => {
      const statement = String(sql);
      if (statement.includes('FROM "public_id_v3_write_gate"')) {
        return { rows: [blockedN1Gate()] };
      }
      if (statement.includes('FROM "sessions" AS "row"') && !sessionBatchRead) {
        sessionBatchRead = true;
        return {
          rows: [{ id: "session-after-n", publicId: "sid_b00000000000000000000000" }],
        };
      }
      if (statement.includes('FROM "') && statement.includes('AS "row"')) {
        return { rows: [] };
      }
      if (statement.includes('INSERT INTO "public_id_v3_migrations"')) {
        return {
          rows: [
            {
              internalId: String((values?.[2] as string[] | undefined)?.[0]),
              newPublicId: String((values?.[3] as string[] | undefined)?.[0]),
            },
          ],
        };
      }
      return { rows: [] };
    });

    await expect(backfillPostReleasePublicIdLedger({ query }, context)).resolves.toEqual({
      eligible: true,
      reserved: 1,
    });
    const insert = query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO "public_id_v3_migrations"'),
    );
    expect(insert?.[1]?.[0]).toBe("session");
    expect(insert?.[1]?.[2]).toEqual(["session-after-n"]);
    expect(insert?.[1]?.[3]).toEqual(["sid_b00000000000000000000000"]);
    expect(String(insert?.[0])).toContain('"oldExternalId"');
    expect(String(insert?.[0])).toContain("NULL");
    expect(query.mock.calls.map(([sql]) => String(sql))).toEqual(
      expect.arrayContaining(["BEGIN", "COMMIT"]),
    );
  });

  it("skips the initial empty automatic release N gate", async () => {
    const query = vi.fn<PublicIdMigrationDatabase["query"]>().mockResolvedValue({
      rows: [
        {
          blocked: true,
          phase: "public-id-v3-n",
          releasePolicy: "automatic",
          releasedAppRelease: null,
          releasedAt: null,
          targetAppRelease: "0".repeat(40),
        },
      ],
    });

    await expect(backfillPostReleasePublicIdLedger({ query }, context)).resolves.toEqual({
      eligible: false,
      reserved: 0,
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it("fails closed when the N1 gate does not match the deployment", async () => {
    const query = vi.fn<PublicIdMigrationDatabase["query"]>().mockResolvedValue({
      rows: [{ ...blockedN1Gate(), targetAppRelease: "c".repeat(40) }],
    });

    await expect(backfillPostReleasePublicIdLedger({ query }, context)).rejects.toThrow(
      "requires the exact blocked N+1 gate",
    );
  });

  it("rolls back when a missing reservation conflicts", async () => {
    let sessionBatchRead = false;
    const query = vi.fn<PublicIdMigrationDatabase["query"]>(async (sql) => {
      const statement = String(sql);
      if (statement.includes('FROM "public_id_v3_write_gate"')) {
        return { rows: [blockedN1Gate()] };
      }
      if (statement.includes('FROM "sessions" AS "row"') && !sessionBatchRead) {
        sessionBatchRead = true;
        return {
          rows: [{ id: "session-after-n", publicId: "sid_b00000000000000000000000" }],
        };
      }
      if (statement.includes('FROM "') && statement.includes('AS "row"')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    await expect(backfillPostReleasePublicIdLedger({ query }, context)).rejects.toThrow(
      "Could not reserve post-release public IDs for session",
    );
    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
  });
});
