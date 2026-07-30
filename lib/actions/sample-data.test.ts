import { installSampleDataset } from "@/lib/sample-data/install";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installSampleData, removeSampleData } from "./sample-data";

const mocks = vi.hoisted(() => {
  class AuthorizationError extends Error {
    constructor(readonly code: "forbidden" | "unauthenticated") {
      super("You are not authorized to perform this action.");
      this.name = "AuthorizationError";
    }
  }
  const tx = {
    $executeRaw: vi.fn(),
    auditLog: { create: vi.fn() },
    keyword: { create: vi.fn() },
    keywordTrafficSnapshot: { createMany: vi.fn() },
    location: { upsert: vi.fn() },
    membership: { findFirst: vi.fn() },
    project: { create: vi.fn(), delete: vi.fn() },
    providerConnection: { create: vi.fn() },
    rankCheck: { create: vi.fn() },
    signal: { createMany: vi.fn() },
    tag: { createMany: vi.fn(), findMany: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    project: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  return {
    AuthorizationError,
    authorize: vi.fn(),
    prisma,
    redirect: vi.fn(() => {
      throw new Error("NEXT_REDIRECT");
    }),
    requireSession: vi.fn(),
    revalidatePath: vi.fn(),
    tx,
    writeAudit: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/auth/authorize", () => ({
  AuthorizationError: mocks.AuthorizationError,
  authorize: mocks.authorize,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
const tagRows = [
  { id: "tag_product", name: "Product" },
  { id: "tag_intent", name: "High intent" },
  { id: "tag_docs", name: "Docs" },
  { id: "tag_comparison", name: "Comparison" },
];

function mockActor(role: "admin" | "member" | "owner" | "viewer" = "member") {
  mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: "project_1", role }],
    role,
  });
}

function mockInstallTransaction() {
  let keywordIndex = 0;
  let rankCheckIndex = 0;
  mocks.tx.location.upsert.mockResolvedValue({ displayName: "United States", id: "loc_us" });
  mocks.tx.project.create.mockResolvedValue({
    domain: "example.com",
    id: "project_sample",
    name: "Sample project - example.com",
    publicId: "prj_e00000000000000000000000",
  });
  mocks.tx.tag.findMany.mockResolvedValue(tagRows);
  mocks.tx.keyword.create.mockImplementation(() => {
    keywordIndex += 1;
    return Promise.resolve({ id: `keyword_${keywordIndex}` });
  });
  mocks.tx.rankCheck.create.mockImplementation(() => {
    rankCheckIndex += 1;
    return Promise.resolve({ id: `rank_check_${rankCheckIndex}` });
  });
  mocks.tx.signal.createMany.mockResolvedValue({ count: 1 });
  mocks.tx.keywordTrafficSnapshot.createMany.mockResolvedValue({ count: 1 });
  mocks.tx.project.delete.mockResolvedValue({ id: "project_1" });
}

describe("sample-data actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActor();
    mockInstallTransaction();
    mocks.authorize.mockReturnValue({ actorId: "user_1", role: "owner" });
    mocks.writeAudit.mockResolvedValue({ id: "audit_1" });
    mocks.tx.$executeRaw.mockResolvedValue(0);
    mocks.tx.membership.findFirst.mockResolvedValue(null);
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      ownerId: "user_1",
      publicId: "prj_d00000000000000000000000",
      writeMode: "active",
    });
  });

  it("enforces create authorization before installing", async () => {
    mocks.authorize.mockImplementationOnce(() => {
      throw new mocks.AuthorizationError("forbidden");
    });

    await expect(installSampleData()).rejects.toBeInstanceOf(mocks.AuthorizationError);

    expect(mocks.tx.membership.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("is idempotent when the actor already belongs to a sample project inside the lock", async () => {
    mocks.tx.membership.findFirst.mockResolvedValue({
      project: { id: "project_sample", publicId: "prj_d00000000000000000000000" },
    });

    await expect(installSampleData()).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith("/app/prj_d00000000000000000000000/overview");
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.tx.membership.findFirst.mock.invocationCallOrder[0],
    );
    expect(mocks.tx.project.create).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("installs sample data and writes an audit record", async () => {
    await expect(installSampleData()).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith("/app/prj_e00000000000000000000000/overview");
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "sample_data.install", projectId: "project_sample" }),
      mocks.tx,
    );
  });

  it("refuses to remove a non-sample project", async () => {
    mockActor("admin");
    mocks.prisma.project.findFirst.mockResolvedValue({
      id: "project_1",
      ownerId: "user_1",
      publicId: "prj_c00000000000000000000000",
      writeMode: "active",
    });

    await expect(
      removeSampleData({ projectId: "prj_c00000000000000000000000" }),
    ).rejects.toMatchObject({
      code: "not_sample_project",
    });

    expect(mocks.tx.project.delete).not.toHaveBeenCalled();
  });

  it("installs no provider connection, manual schedules, and zero-cost checks", async () => {
    await installSampleDataset(
      mocks.prisma as unknown as Parameters<typeof installSampleDataset>[0],
      "user_1",
      new Date("2026-07-05T12:00:00.000Z"),
    );

    expect(mocks.tx.providerConnection.create).not.toHaveBeenCalled();
    expect(mocks.tx.project.create.mock.calls[0][0].data.defaults.create).toMatchObject({
      frequency: "manual",
    });
    for (const call of mocks.tx.keyword.create.mock.calls) {
      expect(call[0].data.schedule.create).toMatchObject({
        frequency: "manual",
      });
    }
    for (const call of mocks.tx.rankCheck.create.mock.calls) {
      expect(call[0].data).toMatchObject({
        attemptCount: 1,
        costCents: "0",
        degradedToCountry: false,
        provider: "sample",
        status: "completed",
        viaFallback: false,
      });
    }
  });
});
