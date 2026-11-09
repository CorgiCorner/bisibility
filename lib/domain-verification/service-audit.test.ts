import type { ProjectDomainVerification } from "@/lib/generated/prisma/client";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  update: vi.fn(),
  find: vi.fn(),
  project: vi.fn(),
  createAudit: vi.fn(),
  dns: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    instanceSetting: { findUnique: async () => ({ value: "1" }) },
    project: { findUniqueOrThrow: mocks.project },
    projectDomainVerification: {
      updateMany: mocks.update,
      findUnique: mocks.find,
      findUniqueOrThrow: mocks.find,
    },
    auditLog: { create: mocks.createAudit },
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("./dns-check", () => ({ checkDnsProof: mocks.dns }));

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { checkDomainVerification, checkStoredVerification } from "./service";

const now = new Date();
const publicId = "prj_abcdefghijklmnopqrstuvwx";
const actor = { id: "user", memberships: [{ projectId: "project", role: "owner" as const }] };
const readers = {
  dns: mocks.dns,
  search: async () => ({ result: "missing" as const, scope: null }),
};
let stored: ProjectDomainVerification;
let audits: Record<string, unknown>[];
beforeEach(() => {
  vi.clearAllMocks();
  stored = {
    id: "row",
    projectId: "project",
    domain: "example.com",
    method: "dns_txt",
    token: "PRIVATE_CHALLENGE",
    revision: 0,
    issuedAt: now,
    verifiedAt: null,
    lastCheckedAt: null,
    lastCheckResult: null,
    proofScope: null,
    failures: 0,
    revokedAt: null,
    noticeSentAt: null,
    nextCheckAt: now,
    updatedAt: now,
  };
  audits = [];
  mocks.project.mockResolvedValue({ publicId, domain: "example.com" });
  mocks.find.mockImplementation(async () => ({ ...stored }));
  mocks.dns.mockResolvedValue("verified");
  mocks.update.mockImplementation(
    async ({
      where,
      data,
    }: {
      where: { revision: number };
      data: Partial<Omit<ProjectDomainVerification, "revision">> & {
        revision: { increment: number };
      };
    }) => {
      if (where.revision !== stored.revision) return { count: 0 };
      stored = { ...stored, ...data, revision: stored.revision + data.revision.increment };
      return { count: 1 };
    },
  );
  mocks.createAudit.mockImplementation(async ({ data }) => {
    audits.push(data);
    return data;
  });
  let tail = Promise.resolve();
  mocks.transaction.mockImplementation((callback: (tx: typeof prisma) => Promise<unknown>) => {
    const result = tail.then(async () => {
      const before = { ...stored };
      const auditCount = audits.length;
      try {
        return await callback(prisma);
      } catch (error) {
        stored = before;
        audits.length = auditCount;
        throw error;
      }
    });
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  });
});

it("atomically audits a manual grant through the real serializer without the token", async () => {
  await checkDomainVerification("project", actor);
  expect(mocks.transaction).toHaveBeenCalledOnce();
  expect(audits).toEqual([
    expect.objectContaining({
      action: "project.domain_verification.grant",
      actorId: "user",
      targetType: "project",
      targetId: publicId,
      projectId: "project",
      before: expect.objectContaining({ verifiedAt: null, proofScope: null, failures: 0 }),
      after: expect.objectContaining({
        domain: "example.com",
        method: "dns_txt",
        proofScope: "domain",
        verifiedAt: now.toISOString(),
        source: "manual",
        revokedAt: null,
      }),
    }),
  ]);
  expect(JSON.stringify(audits)).not.toContain(stored.token);
});

it("attributes a project-key grant without impersonating the owner", async () => {
  await checkDomainVerification("project", actor, null, "key-id");
  expect(audits).toEqual([
    expect.objectContaining({
      actorId: null,
      after: expect.objectContaining({ source: "manual", apiKeyId: "key-id" }),
    }),
  ]);
});

it("audits scheduled third-failure revocation and subsequent regrant", async () => {
  stored = { ...stored, verifiedAt: now, proofScope: "domain", failures: 2 };
  mocks.dns.mockResolvedValue("missing");
  await checkStoredVerification({ ...stored }, now, readers);
  expect(audits).toEqual([
    expect.objectContaining({
      action: "project.domain_verification.revoke",
      actorId: null,
      before: expect.objectContaining({ verifiedAt: now.toISOString(), failures: 2 }),
      after: expect.objectContaining({
        verifiedAt: null,
        revokedAt: now.toISOString(),
        source: "scheduled",
        failures: 3,
      }),
    }),
  ]);
  mocks.dns.mockResolvedValue("verified");
  await checkDomainVerification("project", actor);
  expect(stored.revokedAt).toBeNull();
  expect(audits[1]).toMatchObject({ action: "project.domain_verification.grant", actorId: "user" });
});

it.each(["grant", "revoke"])("rolls back %s when the audit insert fails", async (transition) => {
  if (transition === "revoke") {
    stored = { ...stored, verifiedAt: now, failures: 2, proofScope: "domain" };
    mocks.dns.mockResolvedValue("missing");
  }
  const before = { ...stored };
  mocks.createAudit.mockRejectedValue(new Error("audit write failed"));
  await expect(checkStoredVerification(before, now, readers)).rejects.toThrow("audit write failed");
  expect(stored).toEqual(before);
  expect(audits).toEqual([]);
});

it("does not audit a revision loser or ordinary successful rechecks", async () => {
  const original = { ...stored };
  await Promise.all([
    checkStoredVerification(original, now, readers),
    checkStoredVerification(original, now, readers),
  ]);
  expect(stored.revision).toBe(1);
  expect(audits).toHaveLength(1);
  await checkStoredVerification({ ...stored }, now, readers);
  expect(stored.revision).toBe(2);
  expect(audits).toHaveLength(1);
});

it("audits a newly successful proof after the previous proof expired", async () => {
  stored = { ...stored, verifiedAt: new Date(now.getTime() - 4 * 86400000), proofScope: "domain" };
  await checkStoredVerification({ ...stored }, now, readers);
  expect(audits).toEqual([
    expect.objectContaining({ action: "project.domain_verification.grant" }),
  ]);
  expect(stored.verifiedAt).toEqual(now);
});

it("retains host-scoped evidence and drops tokens supplied to the audit serializer", async () => {
  stored = { ...stored, method: "search_console" };
  await checkStoredVerification(stored, now, {
    dns: mocks.dns,
    search: async () => ({ result: "verified", scope: "host:example.com" }),
  });
  expect(audits[0]).toMatchObject({
    after: { method: "search_console", proofScope: "host:example.com" },
  });
  await writeAudit({
    action: "project.domain_verification.grant",
    actorId: "user",
    projectId: "project",
    targetType: "project",
    targetId: publicId,
    before: stored,
    after: { ...stored, source: "manual" },
  });
  expect(audits[1]).toMatchObject({
    after: { domain: "example.com", proofScope: "host:example.com", source: "manual" },
  });
  expect(JSON.stringify(audits)).not.toContain(stored.token);
});
