import { expect, it } from "vitest";
import { getOssAccount, getOssAccounts } from "./oss-accounts";
import { ago, db, publicId } from "./oss-postgres.test-fixture";

export function registerAccountCases() {
  it("reads account totals, owned and member projects once, and the latest session", async () => {
    const result = await getOssAccounts({ sort: "email", direction: "asc", pageSize: 2 });
    expect(result).toMatchObject({
      account: null,
      accountTotalCount: 4,
      filteredCount: 4,
      pageCount: 2,
      page: 1,
    });
    expect(result?.accounts.map((row) => row.email)).toEqual([
      "admin@example.com",
      "alice@example.com",
    ]);
    expect(result?.accounts[1]).toMatchObject({
      projects: 2,
      lastActive: ago(1).toISOString(),
      keywords: null,
    });
    const next = await getOssAccounts({ sort: "email", direction: "asc", pageSize: 2, page: 2 });
    expect(next?.accounts.map((row) => row.email)).toEqual([
      "bob@example.com",
      "carol@example.com",
    ]);
    expect(next?.accounts.map((row) => row.status)).toEqual(["deactivated", "active"]);
  });
  it.each([
    ["created", "asc", ["actor", "alice", "bob", "carol"]],
    ["created", "desc", ["carol", "bob", "alice", "actor"]],
    ["lastActive", "desc", ["alice", "bob", "actor", "carol"]],
    ["lastActive", "asc", ["bob", "alice", "actor", "carol"]],
    ["projects", "desc", ["alice", "bob", "carol", "actor"]],
    ["projects", "asc", ["actor", "bob", "carol", "alice"]],
    ["status", "asc", ["actor", "alice", "carol", "bob"]],
    ["status", "desc", ["bob", "actor", "alice", "carol"]],
  ] as const)(
    "sorts %s %s with stable public-ID ties and nulls last",
    async (sort, direction, ids) => {
      const result = await getOssAccounts({ sort, direction });
      expect(result?.accounts.map((row) => row.id)).toEqual(
        ids.map((id) => publicId("usr", ["actor", "alice", "bob", "carol"].indexOf(id) + 1)),
      );
    },
  );
  it("searches case-insensitive email or public-ID prefixes and escapes wildcard input", async () => {
    expect(
      (await getOssAccounts({ search: "  ALICE@  " }))?.accounts.map((row) => row.email),
    ).toEqual(["alice@example.com"]);
    expect((await getOssAccounts({ search: publicId("usr", 3) }))?.accounts[0].email).toBe(
      "bob@example.com",
    );
    expect(await getOssAccounts({ search: "%" })).toMatchObject({
      accounts: [],
      accountTotalCount: 4,
      filteredCount: 0,
    });
    expect((await getOssAccounts({ page: 100 }))?.accounts).toEqual([]);
    await expect(getOssAccounts({ sort: "injection" } as never)).rejects.toThrow();
  });
  it("provides index-backed prefix search plans in the isolated schema", async () => {
    const plan = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
      return tx.$queryRaw`EXPLAIN (FORMAT JSON) SELECT id FROM users WHERE lower(email) LIKE 'alice%'`;
    });
    expect(JSON.stringify(plan)).toContain("users_admin_email_prefix_idx");
  });
  it("loads exact account details and writes the existing account-view audit", async () => {
    const result = await getOssAccount("ALICE@EXAMPLE.COM");
    expect(result).toMatchObject({
      status: "found",
      account: { id: publicId("usr", 2), projects: 2, keywords: 4, connections: "analytics: 1" },
    });
    expect(JSON.stringify(result)).not.toMatch(/spend|cost|usage|projectIds/i);
    expect(
      await db.auditLog.findFirst({
        where: { action: "instance_admin.account_viewed" },
        orderBy: { createdAt: "desc" },
      }),
    ).toMatchObject({
      actorId: "actor",
      targetId: publicId("usr", 2),
      targetType: "user",
      after: { result: "found" },
    });
    expect((await getOssAccount(publicId("usr", 2)))?.account?.email).toBe("alice@example.com");
    expect(await getOssAccount("none@example.com")).toMatchObject({
      account: null,
      status: "not_found",
    });
  });
}
