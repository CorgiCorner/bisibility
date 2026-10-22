import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  funding: vi.fn(),
  lock: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    providerConnection: { findUnique: vi.fn(), delete: vi.fn() },
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/metering/budget-mirror", () => ({ guardConnectionFundingMutation: mocks.funding }));
vi.mock("@/lib/provider-allocations/project-lock", () => ({
  lockProjectForProviderMutation: mocks.lock,
}));
vi.mock("./provider-audit", () => ({
  auditConnection: (row: unknown) => row,
  auditProviderMutation: mocks.audit,
}));

import { disconnectProviderSchema } from "@/lib/schemas/provider";
import { disconnectProviderConnection } from "./provider-disconnect";

const own = {
  id: "internal-connection",
  publicId: "conn_a00000000000000000000000",
  provider: "dataforseo",
  credentialSource: "own",
  credentialsEncrypted: "retained-key",
  updatedAt: new Date("2026-10-21T10:00:00Z"),
};
const input = {
  projectId: "prj_a00000000000000000000000",
  providerId: "dataforseo" as const,
  expectedConnection: {
    id: own.publicId,
    updatedAt: own.updatedAt.toISOString(),
    credentialSource: "own" as const,
  },
};
const context = { projectId: "internal-project", actorId: "actor" };

describe("bound own-key removal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.$transaction.mockImplementation((work) => work(mocks.prisma));
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(own);
  });
  it("rejects a source changed to credits before deletion", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({
      ...own,
      credentialSource: "hosted",
    });
    await expect(disconnectProviderConnection(input, context)).rejects.toThrow("changed");
    expect(mocks.prisma.providerConnection.delete).not.toHaveBeenCalled();
  });
  it("rechecks source after acquiring the funding row lock", async () => {
    mocks.prisma.providerConnection.findUnique
      .mockResolvedValueOnce(own)
      .mockResolvedValue({ ...own, credentialSource: "hosted" });
    await expect(disconnectProviderConnection(input, context)).rejects.toThrow("changed");
    expect(mocks.prisma.providerConnection.delete).not.toHaveBeenCalled();
  });
  it.each([
    { publicId: "conn_b00000000000000000000000" },
    { updatedAt: new Date("2026-10-21T10:01:00Z") },
  ])("rejects changed identity or revision", async (delta) => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({ ...own, ...delta });
    await expect(disconnectProviderConnection(input, context)).rejects.toThrow("changed");
    expect(mocks.prisma.providerConnection.delete).not.toHaveBeenCalled();
  });
  it("rejects a missing bound connection", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(null);
    await expect(disconnectProviderConnection(input, context)).rejects.toThrow("changed");
  });
  it("removes the matching own connection after its funding guard", async () => {
    await expect(disconnectProviderConnection(input, context)).resolves.toEqual({ ok: true });
    expect(mocks.funding).toHaveBeenCalledWith(mocks.prisma, own.id);
    expect(mocks.prisma.providerConnection.delete).toHaveBeenCalledWith({ where: { id: own.id } });
    expect(mocks.audit).toHaveBeenCalledOnce();
  });
  it("validates and retains the complete optional binding", () => {
    expect(disconnectProviderSchema.parse(input)).toEqual(input);
    expect(
      disconnectProviderSchema.safeParse({ ...input, expectedConnection: { id: own.publicId } })
        .success,
    ).toBe(false);
    expect(
      disconnectProviderSchema.safeParse({
        ...input,
        expectedConnection: { ...input.expectedConnection, credentialSource: "hosted" },
      }).success,
    ).toBe(false);
  });
  it("keeps unresolved funding operations protected", async () => {
    mocks.funding.mockRejectedValue(new Error("pending operation"));
    await expect(disconnectProviderConnection(input, context)).rejects.toThrow("pending operation");
    expect(mocks.prisma.providerConnection.delete).not.toHaveBeenCalled();
  });
  it("preserves the existing unbound caller behavior", async () => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue({
      ...own,
      credentialSource: "hosted",
    });
    await expect(
      disconnectProviderConnection(
        { projectId: input.projectId, providerId: input.providerId },
        context,
      ),
    ).resolves.toEqual({ ok: true });
    expect(mocks.prisma.providerConnection.delete).toHaveBeenCalledOnce();
  });
});
