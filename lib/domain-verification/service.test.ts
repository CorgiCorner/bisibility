import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setting: vi.fn(),
  project: vi.fn(),
  projectFind: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
  findOrThrow: vi.fn(),
  failure: vi.fn(),
  audit: vi.fn(),
  search: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit, writeAuditFailure: mocks.failure }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    instanceSetting: { findUnique: mocks.setting },
    project: { findUniqueOrThrow: mocks.project, findUnique: mocks.projectFind },
    projectDomainVerification: {
      findUnique: mocks.find,
      updateMany: mocks.update,
      findUniqueOrThrow: mocks.findOrThrow,
    },
  },
}));
vi.mock("./search-console-proof", () => ({ checkSearchConsoleProof: mocks.search }));

import {
  checkDomainVerification,
  checkStoredVerification,
  isProjectDomainVerified,
  readDomainVerification,
} from "./service";

const actor = (role: "owner" | "admin" | "member" | "auditor" | "viewer") => ({
  id: "user",
  memberships: [{ projectId: "project", role }],
});
describe("domain verification authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setting.mockResolvedValue({ value: "1" });
    mocks.project.mockResolvedValue({ domain: "example.com" });
    mocks.find.mockResolvedValue(null);
    mocks.failure.mockResolvedValue(undefined);
    mocks.update.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        project: { findUniqueOrThrow: mocks.project },
        projectDomainVerification: {
          updateMany: mocks.update,
          findUniqueOrThrow: mocks.findOrThrow,
        },
      }),
    );
  });
  it.each(["owner", "admin"] as const)("allows %s", async (role) => {
    await expect(readDomainVerification("project", actor(role))).resolves.toBeNull();
  });
  it.each(["member", "auditor", "viewer"] as const)(
    "denies %s before reading a challenge",
    async (role) => {
      await expect(readDomainVerification("project", actor(role))).rejects.toThrow();
      expect(mocks.find).not.toHaveBeenCalled();
    },
  );
  it("does not break settings for a project with a malformed legacy domain", async () => {
    mocks.project.mockResolvedValue({ domain: "localhost" });
    await expect(readDomainVerification("project", actor("owner"))).resolves.toBeNull();
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it("does not present a URL-prefix proof as verified for a different current host", async () => {
    const row = { verifiedAt: new Date(), proofScope: "host:a.example.com", domain: "example.com" };
    mocks.project.mockResolvedValue({ domain: "b.example.com" });
    mocks.find.mockResolvedValue(row);
    expect(await readDomainVerification("project", actor("owner"))).toEqual({
      ...row,
      verifiedAt: null,
    });
    expect(row.verifiedAt).not.toBeNull();
    mocks.project.mockResolvedValue({ domain: "a.example.com" });
    expect(await readDomainVerification("project", actor("owner"))).toEqual(row);
    mocks.find.mockResolvedValue({ ...row, proofScope: "domain" });
    mocks.project.mockResolvedValue({ domain: "b.example.com" });
    expect((await readDomainVerification("project", actor("owner")))?.verifiedAt).toEqual(
      row.verifiedAt,
    );
  });
  it("disables access when the flag is missing or off", async () => {
    for (const value of [null, { value: "0" }, { value: "true" }]) {
      mocks.setting.mockResolvedValue(value);
      await expect(readDomainVerification("project", actor("owner"))).rejects.toThrow("disabled");
    }
    expect(mocks.project).not.toHaveBeenCalled();
  });
  it("limits URL-prefix proof to its exact host and rejects revoked proof", async () => {
    const now = new Date();
    mocks.projectFind.mockResolvedValue({ domain: "example.com" });
    mocks.find.mockResolvedValue({
      verifiedAt: now,
      revokedAt: null,
      proofScope: "host:example.com",
      nextCheckAt: new Date(now.getTime() + 10000),
    });
    expect(await isProjectDomainVerified("project", "example.com")).toBe(true);
    expect(await isProjectDomainVerified("project", "www.example.com")).toBe(false);
    expect(await isProjectDomainVerified("project", "example.org")).toBe(false);
    mocks.find.mockResolvedValue({
      verifiedAt: now,
      revokedAt: now,
      proofScope: "domain",
      nextCheckAt: new Date(now.getTime() - 3 * 86400000),
    });
    expect(await isProjectDomainVerified("project", "example.com")).toBe(false);
  });
  it.each(["domain", "host:example.com"])(
    "expires %s proof on reads when no recheck runs, even with maintenance disabled",
    async (proofScope) => {
      vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "0");
      const now = new Date();
      const fresh = {
        verifiedAt: now,
        revokedAt: null,
        proofScope,
        lastCheckedAt: new Date("2025-01-01T00:00:00Z"),
        nextCheckAt: new Date("2025-01-01T00:00:00Z"),
      };
      mocks.projectFind.mockResolvedValue({ domain: "example.com" });
      for (const hours of [0, 24, 48, 72, 10000]) {
        const row = { ...fresh, verifiedAt: new Date(now.getTime() - hours * 3600000) };
        mocks.find.mockResolvedValue(row);
        expect(await isProjectDomainVerified("project", "example.com")).toBe(hours < 72);
        const displayed = await readDomainVerification("project", actor("owner"));
        expect(displayed?.verifiedAt).toEqual(hours < 72 ? row.verifiedAt : null);
      }
      expect(mocks.search).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );
  it("uses stored failure history for checks but hides proof for a different current host", async () => {
    const verifiedAt = new Date("2026-01-01T00:00:00Z");
    const row = {
      id: "id",
      revision: 0,
      projectId: "project",
      domain: "example.com",
      method: "search_console",
      token: "challenge",
      proofScope: "host:a.example.com",
      verifiedAt,
      failures: 0,
      issuedAt: verifiedAt,
      updatedAt: verifiedAt,
      revokedAt: null,
      noticeSentAt: null,
      nextCheckAt: verifiedAt,
      lastCheckedAt: verifiedAt,
      lastCheckResult: "verified",
    };
    mocks.project.mockResolvedValue({ domain: "b.example.com" });
    mocks.find.mockResolvedValue(row);
    mocks.findOrThrow.mockResolvedValue({ ...row, failures: 1 });
    mocks.search.mockResolvedValue({ result: "missing", scope: null });
    const result = await checkDomainVerification("project", actor("owner"));
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ verifiedAt, failures: 1, nextCheckAt: expect.any(Date) }),
      }),
    );
    expect(result?.verifiedAt).toBeNull();
  });
  it("uses a compare-and-swap and revokes only on the third failure", async () => {
    const now = new Date("2026-11-06T00:00:00Z");
    const row = {
      id: "id",
      revision: 4,
      projectId: "project",
      domain: "example.com",
      method: "dns_txt",
      token: "challenge",
      proofScope: "domain",
      verifiedAt: now,
      failures: 2,
      issuedAt: now,
      updatedAt: now,
      revokedAt: null,
      noticeSentAt: null,
      nextCheckAt: now,
      lastCheckedAt: now,
      lastCheckResult: "verified",
    };
    mocks.update.mockResolvedValue({ count: 1 });
    mocks.findOrThrow.mockResolvedValue(row);
    await checkStoredVerification(row, now, {
      dns: async () => "missing",
      search: async () => ({ result: "missing", scope: null }),
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "id", revision: 4 },
        data: expect.objectContaining({ failures: 3, verifiedAt: null, revokedAt: now }),
      }),
    );
    expect(JSON.stringify(mocks.update.mock.calls)).not.toContain("challenge");
  });
});
