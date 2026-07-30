import type { PublicIdMigrationDatabase } from "@/lib/public-id-migrator/types";
import { describe, expect, it, vi } from "vitest";
import { cleanupPublicIdV3N1Artifacts } from "./n1-cleanup";

const release = "c".repeat(40);

describe("public ID v3 N+1 artifact cleanup", () => {
  it("drops the exact gate inventory atomically without opening writes", async () => {
    let cleaned = false;
    const query = vi.fn<PublicIdMigrationDatabase["query"]>(async (sql) => {
      const statement = String(sql);
      if (statement.includes('AS "installed"')) return { rows: [{ installed: true }] };
      if (
        statement.includes('FROM "public_id_v3_write_gate"') &&
        statement.includes("FOR UPDATE")
      ) {
        return {
          rows: [
            {
              blocked: true,
              phase: "public-id-v3-n1",
              releasePolicy: "operator",
              releasedAppRelease: null,
              releasedAt: null,
              targetAppRelease: release,
            },
          ],
        };
      }
      if (statement.includes('AS "ready"')) return { rows: [{ ready: true }] };
      if (statement.includes("FROM pg_catalog.pg_tables")) {
        return {
          rows: [
            { schema: "release", table: "alpha" },
            { schema: "release", table: "zeta" },
          ],
        };
      }
      if (statement.includes("WITH required")) return { rows: [{ ready: true }] };
      if (statement.includes('AS "functionInstalled"')) {
        return {
          rows: [
            cleaned
              ? {
                  functionInstalled: false,
                  gateInstalled: false,
                  ledgerInstalled: false,
                  triggerCount: 0,
                }
              : {
                  functionInstalled: true,
                  gateInstalled: true,
                  ledgerInstalled: true,
                  triggerCount: 2,
                },
          ],
        };
      }
      if (statement.includes('FROM "data_migrations"')) {
        return {
          rows: [
            {
              checksum: "396deeba223f6d6d9bfacc8f5f15b4972fef65e2c877f82761448fcf65f27f1a",
              finishedAt: new Date(),
            },
          ],
        };
      }
      if (
        statement.includes('FROM "public_id_v3_migrations"') ||
        statement.includes('LEFT JOIN "public_id_v3_migrations"')
      ) {
        return { rows: [{ count: 0 }] };
      }
      if (statement.includes("FROM pg_catalog.pg_trigger")) {
        return {
          rows: [
            { functionMatches: true, schema: "release", table: "alpha", type: 62 },
            { functionMatches: true, schema: "release", table: "zeta", type: 62 },
          ],
        };
      }
      if (statement === 'DROP TABLE "public_id_v3_write_gate"') cleaned = true;
      return { rows: [] };
    });

    await expect(cleanupPublicIdV3N1Artifacts({ query }, release, "operator")).resolves.toEqual({
      alreadyClean: false,
      cleaned: true,
    });

    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(statements).not.toEqual(
      expect.arrayContaining([expect.stringContaining('"writesBlocked" = FALSE')]),
    );
    expect(
      statements.indexOf('DROP TRIGGER "public_id_v3_write_gate" ON "release"."zeta"'),
    ).toBeLessThan(
      statements.indexOf('DROP FUNCTION "release"."enforce_public_id_v3_write_gate"()'),
    );
    expect(statements.indexOf('DROP TABLE "public_id_v3_migrations"')).toBeLessThan(
      statements.indexOf('DROP TABLE "public_id_v3_write_gate"'),
    );
    expect(statements.at(-1)).toBe("COMMIT");
  });

  it("rolls back a mismatched gate before dropping any artifact", async () => {
    const query = vi.fn<PublicIdMigrationDatabase["query"]>(async (sql) => {
      const statement = String(sql);
      if (statement.includes('AS "installed"')) return { rows: [{ installed: true }] };
      if (statement.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              blocked: false,
              phase: "public-id-v3-n1",
              releasePolicy: "operator",
              releasedAppRelease: release,
              releasedAt: new Date(),
              targetAppRelease: release,
            },
          ],
        };
      }
      return { rows: [] };
    });

    await expect(cleanupPublicIdV3N1Artifacts({ query }, release, "operator")).rejects.toThrow(
      "does not match the verified release",
    );
    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(statements).not.toEqual(expect.arrayContaining([expect.stringMatching(/^DROP /)]));
    expect(statements.at(-1)).toBe("ROLLBACK");
  });
});
