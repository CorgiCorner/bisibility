import { beforeEach, describe, expect, it, vi } from "vitest";
import { getProjectBrandNames, previewBrandNames, updateProjectBrandNames } from "./brand-names";

const projectPublicId = "prj_abcdefghijklmnopqrstuvwx";
const competitorPublicId = "cmp_abcdefghijklmnopqrstuvwx";

const mocks = vi.hoisted(() => {
  class AuthorizationError extends Error {
    constructor() {
      super("You are not authorized to perform this action.");
    }
  }
  const prisma = {
    $transaction: vi.fn(),
    aiTrackingEntityObservation: { update: vi.fn(), updateMany: vi.fn() },
    aiTrackingSample: { findMany: vi.fn() },
    competitor: { findFirst: vi.fn(), update: vi.fn() },
    keyword: { findMany: vi.fn() },
    project: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  prisma.$transaction.mockImplementation((callback) => callback(prisma));
  return {
    AuthorizationError,
    prisma,
    requireSession: vi.fn(),
    revalidatePath: vi.fn(),
    writeAudit: vi.fn(),
  };
});

vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/auth/authorize", () => ({
  AuthorizationError: mocks.AuthorizationError,
  authorize: vi.fn((actor, action, resource) => {
    const role = actor.memberships.find(
      (item: { projectId: string }) => item.projectId === resource.projectId,
    )?.role;
    if (!role || (action !== "read" && role === "viewer")) throw new mocks.AuthorizationError();
  }),
  getProjectRole: vi.fn(
    (actor: { memberships: { projectId: string; role: string }[] }, projectId: string) =>
      actor.memberships.find((item) => item.projectId === projectId)?.role ?? null,
  ),
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

function actor(role: "member" | "viewer" = "member", writeMode = "active") {
  mocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: "project_1", role }],
    role,
  });
  mocks.prisma.project.findFirst.mockResolvedValue({
    domain: "acme.example.com",
    id: "project_1",
    isSample: false,
    ownerId: "user_1",
    publicId: projectPublicId,
    writeMode,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
  actor();
  mocks.prisma.project.findUniqueOrThrow.mockResolvedValue({
    brandAliases: [],
    brandExcludedNames: [],
    domain: "acme.example.com",
    name: "Acme",
    publicId: projectPublicId,
  });
  mocks.prisma.project.update.mockResolvedValue({});
  mocks.prisma.aiTrackingSample.findMany.mockResolvedValue([
    { answerText: "Only Widget is named here." },
  ]);
  mocks.prisma.keyword.findMany.mockResolvedValue([{ text: "best acme tools" }]);
  mocks.prisma.competitor.findFirst.mockResolvedValue({
    domain: "other.example.com",
    label: "Other",
  });
  mocks.writeAudit.mockResolvedValue({});
});

describe("brand name actions", () => {
  it("previews a draft against stored answers without writing observations", async () => {
    const counts = await previewBrandNames({
      aliases: ["Widget"],
      excludedNames: [],
      from: "2026-01-01T00:00:00.000Z",
      projectId: projectPublicId,
      to: "2026-02-01T00:00:00.000Z",
    });
    expect(counts).toMatchObject({ answers: 1, named: 1 });
    expect(counts.names).toEqual([{ count: 1, name: "Widget" }]);
    expect(mocks.prisma.aiTrackingSample.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 500,
        where: expect.objectContaining({
          measurement: "answer_present",
          projectId: "project_1",
        }),
      }),
    );
    expect(mocks.prisma.project.update).not.toHaveBeenCalled();
    expect(mocks.prisma.aiTrackingEntityObservation.update).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("lets a viewer preview and refuses the save", async () => {
    actor("viewer");
    await expect(
      previewBrandNames({ aliases: [], excludedNames: [], projectId: projectPublicId }),
    ).resolves.toMatchObject({ answers: 1 });
    await expect(
      updateProjectBrandNames({
        aliases: ["Widget"],
        excludedNames: [],
        projectId: projectPublicId,
      }),
    ).rejects.toBeInstanceOf(mocks.AuthorizationError);
    expect(mocks.prisma.project.update).not.toHaveBeenCalled();
  });

  it("refuses names in a read-only project and still previews them", async () => {
    actor("member", "migration_hold");
    await expect(
      previewBrandNames({ aliases: ["Widget"], excludedNames: [], projectId: projectPublicId }),
    ).resolves.toMatchObject({ named: 1 });
    await expect(
      updateProjectBrandNames({
        aliases: ["Widget"],
        excludedNames: [],
        projectId: projectPublicId,
      }),
    ).rejects.toThrow(/read-only/);
    expect(mocks.prisma.project.update).not.toHaveBeenCalled();
  });

  it("rejects an alias that is also excluded, or an excluded label, before a write", async () => {
    await expect(
      updateProjectBrandNames({
        aliases: ["Widget"],
        excludedNames: ["widget"],
        projectId: projectPublicId,
      }),
    ).rejects.toThrow(/both an alias and an excluded name/);
    await expect(
      updateProjectBrandNames({
        aliases: [],
        excludedNames: ["Acme"],
        projectId: projectPublicId,
      }),
    ).rejects.toThrow(/cannot be excluded/);
    expect(mocks.prisma.project.update).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("audits a saved own-brand list and does not rewrite stored observations", async () => {
    await updateProjectBrandNames({
      aliases: ["Widget"],
      excludedNames: ["acme.example.org"],
      projectId: projectPublicId,
    });
    expect(mocks.prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { brandAliases: ["Widget"], brandExcludedNames: ["acme.example.org"] },
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "project.brand_names.update",
        after: { brandAliases: ["Widget"], brandExcludedNames: ["acme.example.org"] },
        before: { brandAliases: [], brandExcludedNames: [] },
        targetId: projectPublicId,
        targetType: "project",
      }),
      mocks.prisma,
    );
    expect(mocks.prisma.aiTrackingEntityObservation.update).not.toHaveBeenCalled();
    expect(mocks.prisma.aiTrackingEntityObservation.updateMany).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      expect.stringContaining("ai-visibility"),
      "page",
    );
  });

  it("loads keyword suggestions for the own brand", async () => {
    const view = await getProjectBrandNames(projectPublicId);
    expect(view.keywordSuggestions).toEqual(["best acme tools"]);
    expect(view.domainSuggestion).toBe("acme.example");
    expect(view.canWrite).toBe(true);
    expect(view.counts.named).toBe(0);
  });

  it("previews a competitor draft with that competitor's label", async () => {
    mocks.prisma.aiTrackingSample.findMany.mockResolvedValue([{ answerText: "Other ships." }]);
    const counts = await previewBrandNames({
      aliases: [],
      entityId: competitorPublicId,
      entityKind: "competitor",
      excludedNames: [],
      projectId: projectPublicId,
    });
    expect(counts.named).toBe(1);
    expect(counts.names).toEqual([{ count: 1, name: "Other" }]);
  });
});
