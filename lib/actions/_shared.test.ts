import { type Actor, AuthorizationError } from "@/lib/auth/authorize";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import type { Role } from "@/lib/generated/prisma/client";
import { appPath } from "@/lib/routing/app-path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  makePublicId,
  requireKeywordScope,
  requireProjectScope,
  revalidateProviderViews,
} from "./_shared";

const mocks = vi.hoisted(() => ({
  prisma: {
    keyword: { findFirst: vi.fn() },
    project: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  requireSession: vi.fn(),
  revalidatePath: vi.fn(),
  writeAuditFailure: vi.fn(() => Promise.resolve({ id: "audit_failure_1" })),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/audit", () => ({ writeAuditFailure: mocks.writeAuditFailure }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const writeActions = ["create", "update", "delete", "manage"] as const;

function actorWith(role: Role, projectId = "project_1"): Actor {
  return {
    id: "user_1",
    memberships: [{ projectId, role }],
    role,
  };
}

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "project_1",
    ownerId: "user_1",
    publicId: "prj_a00000000000000000000000",
    writeMode: "active",
    writeModeChangedAt: null,
    writeModeChangedById: null,
    ...overrides,
  };
}

function keywordRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "keyword_1",
    project: { id: "project_1", publicId: "prj_a00000000000000000000000", writeMode: "active" },
    projectId: "project_1",
    publicId: "kw_a00000000000000000000000",
    text: "rank tracker",
    ...overrides,
  };
}

function mockProjectLookup(row = projectRow()) {
  mocks.prisma.project.findFirst.mockImplementation(
    async ({ where }: { where: { publicId: string } }) =>
      where.publicId === row.publicId ? row : null,
  );
}

function mockKeywordLookup(row = keywordRow()) {
  mocks.prisma.keyword.findFirst.mockImplementation(
    async ({ where }: { where: { publicId: string } }) =>
      where.publicId === row.publicId ? row : null,
  );
}

describe("makePublicId", () => {
  it("generates v3 public ids for stable prefixes", () => {
    const pattern = /^(dwh|key|kw|pat|prj|sig|svkw)_[a-z][a-z0-9]{23}$/;
    const prefixes = ["dwh", "key", "kw", "pat", "prj", "sig", "svkw"] as const;

    for (const prefix of prefixes) {
      expect(makePublicId(prefix)).toMatch(pattern);
    }
  });
});

describe("revalidateProviderViews", () => {
  it("refreshes the Rank Tracker checks tab provider indicator after configuration changes", () => {
    revalidateProviderViews();

    expect(mocks.revalidatePath).toHaveBeenCalledWith(appPath("[project]", "rank-tracker"), "page");
  });
});

describe("requireProjectScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectLookup();
    mockKeywordLookup();
  });

  it("resolves a public project id to the internal project scope", async () => {
    await expect(
      requireProjectScope(actorWith("viewer"), "read", "prj_a00000000000000000000000", {
        type: "project",
      }),
    ).resolves.toMatchObject({
      id: "project_1",
      publicId: "prj_a00000000000000000000000",
    });

    expect(mocks.writeAuditFailure).not.toHaveBeenCalled();
  });

  it("throws not-found before auditing when the project does not exist", async () => {
    await expect(
      requireProjectScope(actorWith("owner"), "read", "missing_project", { type: "project" }),
    ).rejects.toThrow("Project not found.");

    expect(mocks.prisma.project.findFirst).not.toHaveBeenCalled();
    expect(mocks.writeAuditFailure).not.toHaveBeenCalled();
  });

  it("denies non-members and records the forbidden audit with the internal project id", async () => {
    await expect(
      requireProjectScope(
        actorWith("member", "project_other"),
        "read",
        "prj_a00000000000000000000000",
        {
          type: "project",
        },
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);

    expect(mocks.writeAuditFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "authorization.read.forbidden",
        actorId: "user_1",
        projectId: "project_1",
        statusReason: "forbidden",
        targetId: "project-scope",
        targetType: "authorization",
      }),
    );
  });

  it("allows viewer reads and denies every project write action", async () => {
    const actor = actorWith("viewer");

    await expect(
      requireProjectScope(actor, "read", "prj_a00000000000000000000000", { type: "project" }),
    ).resolves.toMatchObject({ id: "project_1" });

    for (const action of writeActions) {
      mocks.writeAuditFailure.mockClear();

      await expect(
        requireProjectScope(actor, action, "prj_a00000000000000000000000", { type: "project" }),
      ).rejects.toBeInstanceOf(AuthorizationError);

      expect(mocks.writeAuditFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          action: `authorization.${action}.forbidden`,
          projectId: "project_1",
          targetType: "authorization",
        }),
      );
    }
  });

  it("allows reads during migration hold while blocking writes", async () => {
    mockProjectLookup(projectRow({ writeMode: "migration_hold" }));
    const actor = actorWith("owner");

    await expect(
      requireProjectScope(actor, "read", "prj_a00000000000000000000000", { type: "project" }),
    ).resolves.toMatchObject({ id: "project_1" });

    mocks.writeAuditFailure.mockClear();
    await expect(
      requireProjectScope(actor, "update", "prj_a00000000000000000000000", { type: "project" }),
    ).rejects.toBeInstanceOf(ProjectReadOnlyError);

    expect(mocks.writeAuditFailure).not.toHaveBeenCalled();
  });
});

describe("requireKeywordScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectLookup();
    mockKeywordLookup();
  });

  it("resolves a public keyword id to the internal keyword scope", async () => {
    await expect(
      requireKeywordScope(actorWith("viewer"), "read", "kw_a00000000000000000000000"),
    ).resolves.toEqual({
      id: "keyword_1",
      projectId: "project_1",
      projectPublicId: "prj_a00000000000000000000000",
      publicId: "kw_a00000000000000000000000",
      text: "rank tracker",
    });

    expect(mocks.writeAuditFailure).not.toHaveBeenCalled();
  });

  it("throws not-found before auditing when the keyword does not exist", async () => {
    await expect(
      requireKeywordScope(actorWith("owner"), "read", "missing_keyword"),
    ).rejects.toThrow("Keyword not found.");

    expect(mocks.prisma.keyword.findFirst).not.toHaveBeenCalled();
    expect(mocks.writeAuditFailure).not.toHaveBeenCalled();
  });

  it("denies non-members and records the forbidden audit with the keyword project id", async () => {
    await expect(
      requireKeywordScope(
        actorWith("member", "project_other"),
        "read",
        "kw_a00000000000000000000000",
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);

    expect(mocks.writeAuditFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "authorization.read.forbidden",
        actorId: "user_1",
        projectId: "project_1",
        statusReason: "forbidden",
        targetId: "project-scope",
        targetType: "authorization",
      }),
    );
  });

  it("allows viewer reads and denies every keyword write action", async () => {
    const actor = actorWith("viewer");

    await expect(
      requireKeywordScope(actor, "read", "kw_a00000000000000000000000"),
    ).resolves.toMatchObject({
      id: "keyword_1",
    });

    for (const action of writeActions) {
      mocks.writeAuditFailure.mockClear();

      await expect(
        requireKeywordScope(actor, action, "kw_a00000000000000000000000"),
      ).rejects.toBeInstanceOf(AuthorizationError);

      expect(mocks.writeAuditFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          action: `authorization.${action}.forbidden`,
          projectId: "project_1",
          targetType: "authorization",
        }),
      );
    }
  });

  it("allows reads during migration hold while blocking writes", async () => {
    mockKeywordLookup(
      keywordRow({
        project: {
          id: "project_1",
          publicId: "prj_a00000000000000000000000",
          writeMode: "migration_hold",
        },
      }),
    );
    const actor = actorWith("owner");

    await expect(
      requireKeywordScope(actor, "read", "kw_a00000000000000000000000"),
    ).resolves.toMatchObject({
      id: "keyword_1",
    });

    mocks.writeAuditFailure.mockClear();
    await expect(
      requireKeywordScope(actor, "update", "kw_a00000000000000000000000"),
    ).rejects.toBeInstanceOf(ProjectReadOnlyError);

    expect(mocks.writeAuditFailure).not.toHaveBeenCalled();
  });
});
