import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseResetTwoFactorOptions, resetTwoFactor } from "./reset-two-factor";

const query = vi.fn();
const db = { query };

describe("instance-admin two-factor reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires an explicit confirmation and both exact account emails", () => {
    expect(() =>
      parseResetTwoFactorOptions([
        "--operator-email",
        "operator@example.com",
        "--email",
        "locked@example.com",
      ]),
    ).toThrow("Pass --confirm-reset-2fa");
    expect(
      parseResetTwoFactorOptions([
        "--operator-email",
        " Operator@Example.com ",
        "--email",
        " Locked@Example.com ",
        "--confirm-reset-2fa",
      ]),
    ).toEqual({
      confirmResetTwoFactor: true,
      email: "locked@example.com",
      operatorEmail: "operator@example.com",
    });
  });

  it("refuses a caller who is not an instance administrator", async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: "operator_1", isInstanceAdmin: false, twoFactorEnabled: false }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      resetTwoFactor(db, {
        confirmResetTwoFactor: true,
        email: "locked@example.com",
        operatorEmail: "operator@example.com",
      }),
    ).rejects.toThrow("not an instance administrator");
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN ISOLATION LEVEL SERIALIZABLE",
      expect.stringContaining('FROM "users"'),
      "ROLLBACK",
    ]);
  });

  it("atomically removes factors, sessions and grants and writes an audit row", async () => {
    const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
    const transactionalQuery = vi.fn(async (sql: string, values: readonly unknown[] = []) => {
      calls.push({ sql, values });
      if (sql.startsWith("BEGIN") || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [] };
      }
      if (sql.includes('FROM "users"') && values[0] === "operator@example.com") {
        return {
          rows: [
            {
              id: "operator_1",
              isInstanceAdmin: true,
              publicId: "usr_abcdefghijklmnopqrstuvwx",
              twoFactorEnabled: true,
            },
          ],
        };
      }
      if (sql.includes('FROM "users"') && values[0] === "locked@example.com") {
        return {
          rows: [
            {
              id: "user_1",
              isInstanceAdmin: false,
              publicId: "usr_bcdefghijklmnopqrstuvwxy",
              twoFactorEnabled: true,
            },
          ],
        };
      }
      if (sql.includes('DELETE FROM "twoFactor"')) return { rows: [{ id: "factor_1" }] };
      if (sql.includes('UPDATE "users"')) return { rows: [{ id: "user_1" }] };
      if (sql.includes('DELETE FROM "sessions"')) {
        return { rows: [{ id: "session_1" }, { id: "session_2" }] };
      }
      if (sql.includes('DELETE FROM "verifications"')) {
        return { rows: [{ id: "grant_1" }, { id: "grant_2" }] };
      }
      if (sql.includes('INSERT INTO "audit_logs"')) return { rows: [{ id: values[0] }] };
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    await expect(
      resetTwoFactor(
        { query: transactionalQuery },
        {
          confirmResetTwoFactor: true,
          email: "locked@example.com",
          operatorEmail: "operator@example.com",
        },
      ),
    ).resolves.toEqual({
      factorCount: 1,
      grantCount: 2,
      id: "user_1",
      sessionCount: 2,
    });

    const audit = calls.find(({ sql }) => sql.includes('INSERT INTO "audit_logs"'));
    expect(audit?.sql).toContain("instance_admin.account_two_factor_reset");
    expect(audit?.values[2]).toBe("operator_1");
    expect(audit?.values[3]).toBe("usr_bcdefghijklmnopqrstuvwxy");
    expect(JSON.parse(String(audit?.values[5]))).toEqual({
      enabled: false,
      grantsRevoked: 2,
      sessionsRevoked: 2,
    });
    expect(calls.at(-1)?.sql).toBe("COMMIT");
  });

  it("rolls back all mutations when the audit insert fails", async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "operator_1",
            isInstanceAdmin: true,
            publicId: "usr_abcdefghijklmnopqrstuvwx",
            twoFactorEnabled: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "user_1",
            isInstanceAdmin: false,
            publicId: "usr_bcdefghijklmnopqrstuvwxy",
            twoFactorEnabled: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: "factor_1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "user_1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "session_1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("audit unavailable"))
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      resetTwoFactor(db, {
        confirmResetTwoFactor: true,
        email: "locked@example.com",
        operatorEmail: "operator@example.com",
      }),
    ).rejects.toThrow("audit unavailable");
    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
  });
});
