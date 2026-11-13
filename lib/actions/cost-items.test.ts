import {
  createCostItemAction,
  deleteCostItemAction,
  endCostItemAction,
} from "@/lib/actions/cost-items";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT = "prj_a00000000000000000000000";
const OTHER = "prj_b00000000000000000000000";

const mocks = vi.hoisted(() => {
  class AuthorizationError extends Error {
    constructor(readonly code: "forbidden" | "unauthenticated") {
      super("You are not authorized to perform this action.");
      this.name = "AuthorizationError";
    }
  }
  const roleRank = { admin: 2, auditor: 0.5, member: 1, owner: 3, viewer: 0 };
  const minimumRoleByAction = {
    create: "member",
    delete: "admin",
    manage: "admin",
    read: "viewer",
    update: "member",
  } as const;
  return {
    AuthorizationError,
    authorize: vi.fn((actor, action, resource) => {
      if (!actor) throw new AuthorizationError("unauthenticated");
      const role = actor.memberships?.find(
        (item: { projectId: string }) => item.projectId === resource.projectId,
      )?.role;
      const required = (resource.requiredRole ??
        minimumRoleByAction[action as keyof typeof minimumRoleByAction]) as keyof typeof roleRank;
      if (!role || roleRank[role as keyof typeof roleRank] < roleRank[required]) {
        throw new AuthorizationError("forbidden");
      }
      return { actorId: actor.id, projectId: resource.projectId, role };
    }),
    otherOwner: "user_1",
    prisma: {
      $transaction: vi.fn(),
      costItem: { create: vi.fn(), delete: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
      project: { findFirst: vi.fn() },
      user: { findUnique: vi.fn() },
    },
    requireSession: vi.fn(),
    revalidatePath: vi.fn(),
    writeAudit: vi.fn(),
    writeMode: "active",
  };
});

vi.mock("@/lib/auth/authorize", () => ({
  AuthorizationError: mocks.AuthorizationError,
  authorize: mocks.authorize,
}));
vi.mock("@/lib/auth/audit", () => ({
  requiredPublicAuditId: (value: string) => value,
  writeAudit: mocks.writeAudit,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

function project(publicId: string) {
  const other = publicId === OTHER;
  return {
    domain: "example.com",
    id: other ? "project_2" : "project_1",
    isSample: false,
    ownerId: other ? mocks.otherOwner : "user_1",
    publicId,
    writeMode: mocks.writeMode,
    writeModeChangedAt: null,
    writeModeChangedById: null,
  };
}

function actor(role: "admin" | "member" | "viewer", projects = ["project_1"]) {
  mocks.requireSession.mockResolvedValue({ user: { email: "owner@example.com", id: "user_1" } });
  mocks.prisma.user.findUnique.mockResolvedValue({
    memberships: projects.map((projectId) => ({ projectId, role })),
    role: null,
  });
}

function payload(patch: Record<string, unknown> = {}) {
  return {
    amountMinor: 1_200,
    billing: "monthly",
    catalogKey: null,
    currency: "USD",
    discount: null,
    kind: "custom",
    name: "Notes",
    planLabel: "",
    projectId: PROJECT,
    projects: [{ basisPoints: null, projectPublicId: PROJECT }],
    split: "single_project",
    startedOn: "2026-11-01",
    trialUntil: null,
    ...patch,
  };
}

describe("cost item actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.otherOwner = "user_1";
    mocks.writeMode = "active";
    mocks.prisma.$transaction.mockImplementation((body) => body(mocks.prisma));
    mocks.prisma.project.findFirst.mockImplementation(async ({ where }) => project(where.publicId));
    mocks.prisma.costItem.findFirst.mockResolvedValue({
      amountMinor: 1_200,
      billing: "monthly",
      catalogKey: null,
      currency: "USD",
      endedOn: null,
      id: "item_1",
      kind: "custom",
      name: "Notes",
      planLabel: "",
      projects: [{ basisPoints: null, project: { publicId: PROJECT } }],
      publicId: "cst_costitemactiontestaaaa",
      split: "single_project",
      startedOn: new Date("2026-11-01T00:00:00.000Z"),
    });
  });

  it("audits a created item for an admin", async () => {
    actor("admin");
    await createCostItemAction(payload());
    expect(mocks.prisma.costItem.create).toHaveBeenCalledOnce();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "cost_item.create",
        after: expect.objectContaining({ name: "Notes" }),
      }),
      mocks.prisma,
    );
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it("rejects a viewer and a member before writing", async () => {
    actor("viewer");
    await expect(createCostItemAction(payload())).rejects.toBeInstanceOf(mocks.AuthorizationError);
    actor("member");
    await expect(createCostItemAction(payload())).rejects.toBeInstanceOf(mocks.AuthorizationError);
    expect(mocks.prisma.costItem.create).not.toHaveBeenCalled();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("rejects a read-only project before writing", async () => {
    actor("admin");
    mocks.writeMode = "migration_hold";
    await expect(createCostItemAction(payload())).rejects.toThrow(/read-only/);
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("rejects a project from another account and a percent outside 0 to 100", async () => {
    actor("admin", ["project_1", "project_2"]);
    mocks.otherOwner = "user_2";
    await expect(
      createCostItemAction(
        payload({
          projects: [
            { basisPoints: null, projectPublicId: PROJECT },
            { basisPoints: null, projectPublicId: OTHER },
          ],
          split: "equal",
        }),
      ),
    ).rejects.toThrow(/another account/);
    await expect(
      createCostItemAction(
        payload({
          projects: [{ basisPoints: -1, projectPublicId: PROJECT }],
          split: "percent",
        }),
      ),
    ).rejects.toThrow();
    expect(mocks.prisma.costItem.create).not.toHaveBeenCalled();
  });

  it("audits end and delete", async () => {
    actor("admin");
    await endCostItemAction({ projectId: PROJECT, publicId: "cst_costitemactiontestaaaa" });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "cost_item.end" }),
      mocks.prisma,
    );
    await deleteCostItemAction({ projectId: PROJECT, publicId: "cst_costitemactiontestaaaa" });
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "cost_item.delete",
        before: expect.objectContaining({ name: "Notes" }),
      }),
      mocks.prisma,
    );
  });
});
