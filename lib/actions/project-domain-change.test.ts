import { confirmProjectDomainChange } from "@/lib/actions/project-domain-change";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT_ID = "prj_abcdefghijklmnopqrstuvwx";

const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    project: { findUnique: vi.fn(), updateMany: vi.fn() },
  };

  return {
    getActionActor: vi.fn(),
    prisma,
    requireProjectScope: vi.fn(),
    revalidateSettingsViews: vi.fn(),
    requiredPublicAuditId: vi.fn((value: string) => value),
    writeAudit: vi.fn(),
  };
});

vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: mocks.requiredPublicAuditId,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: mocks.getActionActor,
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.requireProjectScope,
  revalidateSettingsViews: mocks.revalidateSettingsViews,
}));

function input(overrides: Record<string, unknown> = {}) {
  return {
    confirmationDomain: "old.example.com",
    newDomain: "new.example.com",
    projectId: PROJECT_ID,
    ...overrides,
  };
}

describe("confirmProjectDomainChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue({ id: "user_1" });
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1", publicId: PROJECT_ID });
    mocks.prisma.project.findUnique.mockResolvedValue({
      domain: "old.example.com",
      publicId: PROJECT_ID,
    });
    mocks.prisma.project.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mocks.prisma) => Promise<unknown>) => callback(mocks.prisma),
    );
    mocks.writeAudit.mockResolvedValue({});
  });

  it("authorizes the resolved project before reading or changing its domain", async () => {
    mocks.requireProjectScope.mockRejectedValueOnce(new Error("Forbidden"));

    await expect(confirmProjectDomainChange(input())).rejects.toThrow("Forbidden");

    expect(mocks.requireProjectScope).toHaveBeenCalledWith({ id: "user_1" }, "update", PROJECT_ID, {
      type: "project",
    });
    expect(mocks.prisma.project.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.project.updateMany).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("rejects a confirmation that does not match the persisted current domain", async () => {
    await expect(
      confirmProjectDomainChange(input({ confirmationDomain: "other.example.com" })),
    ).rejects.toThrow("Confirmation domain does not match this project.");

    expect(mocks.prisma.project.updateMany).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("normalizes the typed confirmation and replacement domain on the server", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({
      domain: "HTTPS://WWW.Old.Example.com./path",
      publicId: PROJECT_ID,
    });

    await confirmProjectDomainChange(
      input({
        confirmationDomain: " old.example.com. ",
        newDomain: "https://WWW.New.Example.com./path",
      }),
    );

    expect(mocks.prisma.project.updateMany).toHaveBeenCalledWith({
      data: { domain: "new.example.com" },
      where: { domain: "HTTPS://WWW.Old.Example.com./path", id: "project_1" },
    });
  });

  it("updates after confirmation and records a truthful audit entry", async () => {
    await expect(confirmProjectDomainChange(input())).resolves.toEqual({
      domain: "new.example.com",
      projectId: PROJECT_ID,
    });

    expect(mocks.writeAudit).toHaveBeenCalledWith(
      {
        action: "settings.project_domain.update",
        actorId: "user_1",
        after: { domain: "new.example.com", publicId: PROJECT_ID },
        before: { domain: "old.example.com", publicId: PROJECT_ID },
        projectId: "project_1",
        targetId: PROJECT_ID,
        targetType: "project",
      },
      mocks.prisma,
    );
    expect(mocks.revalidateSettingsViews).toHaveBeenCalledOnce();
  });

  it("does not write a success audit entry when the update fails", async () => {
    mocks.prisma.project.updateMany.mockRejectedValueOnce(new Error("Database unavailable"));

    await expect(confirmProjectDomainChange(input())).rejects.toThrow("Database unavailable");

    expect(mocks.writeAudit).not.toHaveBeenCalled();
    expect(mocks.revalidateSettingsViews).not.toHaveBeenCalled();
  });

  it("sets an initial domain only with a blank confirmation", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({ domain: null, publicId: PROJECT_ID });

    await expect(confirmProjectDomainChange(input({ confirmationDomain: "" }))).resolves.toEqual({
      domain: "new.example.com",
      projectId: PROJECT_ID,
    });

    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "settings.project_domain.set",
        before: { domain: null, publicId: PROJECT_ID },
      }),
      mocks.prisma,
    );
  });

  it("rejects a nonblank confirmation when the project has no current domain", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue({ domain: null, publicId: PROJECT_ID });

    await expect(confirmProjectDomainChange(input())).rejects.toThrow(
      "This project has no configured domain. Leave the confirmation blank to set its first domain.",
    );

    expect(mocks.prisma.project.updateMany).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });
});
