import type { PublicIdMigrationDatabase } from "@/lib/public-id-migrator/types";
import { describe, expect, it, vi } from "vitest";
import { publicIdV3N1WriteGateContext, reblockPublicIdV3N1WriteGate } from "./n1-write-gate";

const releaseN = "a".repeat(40);
const releaseN1 = "b".repeat(40);

function context() {
  return publicIdV3N1WriteGateContext({
    APP_VERSION: releaseN1,
    DEPLOYMENT_ENV: "production",
  });
}

describe("public ID v3 N+1 write gate", () => {
  it("requires an exact production app release", () => {
    expect(context()).toEqual({
      phase: "public-id-v3-n1",
      releasePolicy: "operator",
      targetAppRelease: releaseN1,
    });
    expect(() =>
      publicIdV3N1WriteGateContext({
        APP_VERSION: "not-a-sha",
        DEPLOYMENT_ENV: "production",
      }),
    ).toThrow("exact lowercase 40-character commit SHA");
  });

  it("reblocks a released N gate transactionally after locking protected tables", async () => {
    const query = vi.fn<PublicIdMigrationDatabase["query"]>(async (sql) => {
      const statement = String(sql);
      if (statement.includes("to_regclass")) return { rows: [{ installed: true }] };
      if (statement.includes("FROM pg_catalog.pg_tables")) {
        return {
          rows: [
            { schema: "release", table: "alpha" },
            { schema: "release", table: "zeta" },
          ],
        };
      }
      if (statement.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              blocked: false,
              phase: "public-id-v3-n",
              releasePolicy: "operator",
              releasedAppRelease: releaseN,
              releasedAt: new Date(),
              targetAppRelease: releaseN,
            },
          ],
        };
      }
      if (statement.includes('FROM "data_migrations"')) {
        return { rows: [{ ready: 1 }] };
      }
      if (statement.includes('UPDATE "public_id_v3_write_gate"')) {
        return { rows: [{ phase: "public-id-v3-n1" }] };
      }
      return { rows: [] };
    });

    await expect(reblockPublicIdV3N1WriteGate({ query }, context())).resolves.toEqual({
      installed: true,
      transitioned: true,
    });

    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(statements).toContain("BEGIN");
    expect(statements).toContain('LOCK TABLE "release"."alpha" IN SHARE ROW EXCLUSIVE MODE');
    expect(statements).toContain('LOCK TABLE "release"."zeta" IN SHARE ROW EXCLUSIVE MODE');
    expect(statements).toContain('LOCK TABLE "data_migrations" IN SHARE ROW EXCLUSIVE MODE');
    expect(
      statements.indexOf('LOCK TABLE "release"."alpha" IN SHARE ROW EXCLUSIVE MODE'),
    ).toBeLessThan(statements.indexOf('LOCK TABLE "release"."zeta" IN SHARE ROW EXCLUSIVE MODE'));
    const update = query.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE "public_id_v3_write_gate"'),
    );
    expect(update?.[1]).toEqual([
      "public-id-v3-n1",
      "operator",
      releaseN1,
      "public-id-v3-n",
      "operator",
      releaseN,
    ]);
    expect(String(update?.[0])).toContain('"releasedAt" = NULL');
    expect(String(update?.[0])).toContain('"releasedAppRelease" = NULL');
    expect(statements.at(-1)).toBe("COMMIT");
  });

  it("rolls back instead of advancing a still-blocked release N", async () => {
    const query = vi.fn<PublicIdMigrationDatabase["query"]>(async (sql) => {
      const statement = String(sql);
      if (statement.includes("to_regclass")) return { rows: [{ installed: true }] };
      if (statement.includes("FROM pg_catalog.pg_tables")) return { rows: [] };
      if (statement.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              blocked: true,
              phase: "public-id-v3-n",
              releasePolicy: "operator",
              releasedAppRelease: null,
              releasedAt: null,
              targetAppRelease: releaseN,
            },
          ],
        };
      }
      return { rows: [] };
    });

    await expect(reblockPublicIdV3N1WriteGate({ query }, context())).rejects.toThrow(
      "release N is still blocked",
    );
    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
  });

  it("retargets only the initial fresh N1 gate after Prisma", async () => {
    const query = vi.fn<PublicIdMigrationDatabase["query"]>(async (sql) => {
      const statement = String(sql);
      if (statement.includes('AS "installed"')) return { rows: [{ installed: true }] };
      if (statement.includes("WITH required(table_name, prefix)")) {
        return { rows: [{ ready: true }] };
      }
      if (statement.includes('AS "gateInstalled"')) {
        return {
          rows: [
            {
              functionInstalled: true,
              gateInstalled: true,
              ledgerInstalled: true,
              triggerCount: 23,
            },
          ],
        };
      }
      if (statement.includes("\"phase\" = 'public-id-v3-n1'")) {
        return { rows: [{ ready: true }] };
      }
      if (statement.includes("FROM pg_catalog.pg_tables")) return { rows: [] };
      if (statement.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              blocked: true,
              phase: "public-id-v3-n1",
              releasePolicy: "automatic",
              releasedAppRelease: null,
              releasedAt: null,
              targetAppRelease: "0".repeat(40),
            },
          ],
        };
      }
      if (statement.includes('::bigint AS "count"')) return { rows: [{ count: "0" }] };
      if (statement.includes('UPDATE "public_id_v3_write_gate"')) {
        return { rows: [{ phase: "public-id-v3-n1" }] };
      }
      return { rows: [] };
    });

    await expect(
      reblockPublicIdV3N1WriteGate({ query }, context(), {
        allowFreshBlockedN: true,
      }),
    ).resolves.toEqual({ installed: true, transitioned: true });
  });

  it("lets an exact empty fresh N gate resume Prisma without advancing it in code", async () => {
    const query = vi.fn<PublicIdMigrationDatabase["query"]>(async (sql) => {
      const statement = String(sql);
      if (statement.includes('AS "installed"')) return { rows: [{ installed: true }] };
      if (statement.includes("FROM pg_catalog.pg_tables")) return { rows: [] };
      if (statement.includes("FOR UPDATE")) {
        return {
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
        };
      }
      if (statement.includes('::bigint AS "count"')) return { rows: [{ count: "0" }] };
      return { rows: [] };
    });

    await expect(
      reblockPublicIdV3N1WriteGate({ query }, context(), {
        allowFreshBlockedN: true,
      }),
    ).resolves.toEqual({ installed: true, transitioned: false });
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('UPDATE "public_id_v3_write_gate"')),
    ).toBe(false);
    expect(query).toHaveBeenLastCalledWith("COMMIT");
  });

  it("rejects a populated blocked N gate even when it resembles a fresh install", async () => {
    const query = vi.fn<PublicIdMigrationDatabase["query"]>(async (sql) => {
      const statement = String(sql);
      if (statement.includes('AS "installed"')) return { rows: [{ installed: true }] };
      if (statement.includes("FROM pg_catalog.pg_tables")) return { rows: [] };
      if (statement.includes("FOR UPDATE")) {
        return {
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
        };
      }
      if (statement.includes('::bigint AS "count"')) return { rows: [{ count: "1" }] };
      return { rows: [] };
    });

    await expect(
      reblockPublicIdV3N1WriteGate({ query }, context(), {
        allowFreshBlockedN: true,
      }),
    ).rejects.toThrow("only on an empty fresh database");
    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
  });

  it("does not let a different deployment target steal a blocked N1 gate", async () => {
    const query = vi.fn<PublicIdMigrationDatabase["query"]>(async (sql) => {
      const statement = String(sql);
      if (statement.includes("to_regclass")) return { rows: [{ installed: true }] };
      if (statement.includes("FROM pg_catalog.pg_tables")) return { rows: [] };
      if (statement.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              blocked: true,
              phase: "public-id-v3-n1",
              releasePolicy: "operator",
              releasedAppRelease: null,
              releasedAt: null,
              targetAppRelease: "d".repeat(40),
            },
          ],
        };
      }
      return { rows: [] };
    });

    await expect(
      reblockPublicIdV3N1WriteGate({ query }, context(), {
        allowFreshBlockedN: true,
      }),
    ).rejects.toThrow("consistently released release N");
    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
  });

  it("does not touch a database before the gate migration exists", async () => {
    const query = vi
      .fn<PublicIdMigrationDatabase["query"]>()
      .mockResolvedValue({ rows: [{ installed: false }] });

    await expect(reblockPublicIdV3N1WriteGate({ query }, context())).resolves.toEqual({
      installed: false,
      transitioned: false,
    });
    expect(query).toHaveBeenCalledOnce();
    expect(String(query.mock.calls[0]?.[0])).toContain("WHEN current_schema() IS NULL THEN FALSE");
  });
});
