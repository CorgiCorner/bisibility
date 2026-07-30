import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSeedOptions, seedInstanceAdmin } from "./seed-instance-admin";

const query = vi.fn();
const db = { query };

describe("seed instance admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses an explicit email and force option", () => {
    expect(parseSeedOptions(["--email", " Operator@Example.com ", "--force"], {})).toEqual({
      email: "operator@example.com",
      force: true,
    });
  });

  it("is idempotent when the target account is already an admin", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: "user_1", isInstanceAdmin: true }] });

    await expect(
      seedInstanceAdmin(db, { email: "operator@example.com", force: false }),
    ).resolves.toEqual({ changed: false, id: "user_1" });
    expect(query).toHaveBeenCalledOnce();
  });

  it("grants the flag when no instance admin exists", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: "user_1", isInstanceAdmin: false }] })
      .mockResolvedValueOnce({ rows: [{ id: "user_1" }] });

    await expect(
      seedInstanceAdmin(db, { email: "operator@example.com", force: false }),
    ).resolves.toEqual({ changed: true, id: "user_1" });
    expect(query.mock.calls[1][0]).toContain("NOT EXISTS");
  });

  it("refuses to add another admin unless forced", async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: "user_2", isInstanceAdmin: false }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      seedInstanceAdmin(db, { email: "second@example.com", force: false }),
    ).rejects.toThrow("already exists");
  });

  it("force reassignment leaves exactly one admin and writes an audit row", async () => {
    const users = [
      {
        email: "first@example.com",
        id: "user_1",
        isInstanceAdmin: true,
        publicId: "usr_abcdefghijklmnopqrstuvwx",
      },
      {
        email: "second@example.com",
        id: "user_2",
        isInstanceAdmin: false,
        publicId: "usr_bcdefghijklmnopqrstuvwxy",
      },
      {
        email: "third@example.com",
        id: "user_3",
        isInstanceAdmin: true,
        publicId: "usr_cdefghijklmnopqrstuvwxyz",
      },
    ];
    const audits: Array<{ sql: string; values: readonly unknown[] }> = [];
    const transactionalQuery = vi.fn(async (sql: string, values: readonly unknown[] = []) => {
      if (sql.startsWith("BEGIN") || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [] };
      }
      if (sql.includes('FROM "users"') && sql.includes('lower("email")')) {
        return {
          rows: users.filter((user) => user.email === values[0]).map((user) => ({ ...user })),
        };
      }
      if (sql.includes('SET "isInstanceAdmin" = false')) {
        const cleared = users.filter((user) => user.id !== values[0] && user.isInstanceAdmin);
        cleared.forEach((user) => {
          user.isInstanceAdmin = false;
        });
        return { rows: cleared.map(({ id }) => ({ id })) };
      }
      if (sql.includes('SET "isInstanceAdmin" = true')) {
        const target = users.find((user) => user.id === values[0]);
        if (target) target.isInstanceAdmin = true;
        return { rows: target ? [{ id: target.id }] : [] };
      }
      if (sql.includes('INSERT INTO "audit_logs"')) {
        audits.push({ sql, values });
        return { rows: [{ id: values[0] }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    await expect(
      seedInstanceAdmin(
        { query: transactionalQuery },
        { email: "second@example.com", force: true },
      ),
    ).resolves.toEqual({ changed: true, id: "user_2" });

    expect(users.filter((user) => user.isInstanceAdmin)).toEqual([
      expect.objectContaining({ id: "user_2" }),
    ]);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.sql).toContain("instance_admin.reassigned");
    expect(audits[0]?.values[2]).toBe("usr_bcdefghijklmnopqrstuvwxy");
    expect(JSON.parse(String(audits[0]?.values[3]))).toEqual({
      isInstanceAdmin: false,
      previousAdministratorIds: ["user_1", "user_3"],
    });
    expect(transactionalQuery.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN ISOLATION LEVEL SERIALIZABLE",
      expect.stringContaining('SELECT "id", "publicId", "isInstanceAdmin"'),
      expect.stringContaining('SET "isInstanceAdmin" = false'),
      expect.stringContaining('SET "isInstanceAdmin" = true'),
      expect.stringContaining('INSERT INTO "audit_logs"'),
      "COMMIT",
    ]);
  });

  it("refuses a missing account", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(
      seedInstanceAdmin(db, { email: "missing@example.com", force: false }),
    ).rejects.toThrow("No account exists");
  });
});
