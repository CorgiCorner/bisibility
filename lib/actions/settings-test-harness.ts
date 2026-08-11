import { vi } from "vitest";

const settingsActionMocks = vi.hoisted(() => {
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
  const prisma = {
    $transaction: vi.fn(),
    keyword: { findMany: vi.fn(), updateMany: vi.fn() },
    project: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    projectDefaults: { findUnique: vi.fn(), upsert: vi.fn() },
    user: { findUnique: vi.fn() },
  };

  return {
    AuthorizationError,
    authorize: vi.fn((actor, action, resource) => {
      if (!actor) {
        throw new AuthorizationError("unauthenticated");
      }
      const role = actor.memberships?.find(
        (item: { projectId: string }) => item.projectId === resource.projectId,
      )?.role;
      const requiredRole = (resource.requiredRole ??
        minimumRoleByAction[action as keyof typeof minimumRoleByAction]) as keyof typeof roleRank;
      if (!role || roleRank[role as keyof typeof roleRank] < roleRank[requiredRole]) {
        throw new AuthorizationError("forbidden");
      }
      return { actorId: actor.id, projectId: resource.projectId, role };
    }),
    prisma,
    requireSession: vi.fn(),
    revalidatePath: vi.fn(),
    resolveKeywordLocation: vi.fn(),
    runCheckNow: vi.fn(),
    writeAudit: vi.fn(),
  };
});

vi.mock("@/lib/auth/authorize", () => ({
  AuthorizationError: settingsActionMocks.AuthorizationError,
  authorize: settingsActionMocks.authorize,
}));
vi.mock("next/cache", () => ({ revalidatePath: settingsActionMocks.revalidatePath }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: settingsActionMocks.writeAudit }));
vi.mock("@/lib/auth/session", () => ({ requireSession: settingsActionMocks.requireSession }));
vi.mock("@/lib/db/prisma", () => ({ prisma: settingsActionMocks.prisma }));
vi.mock("@/lib/serp/location-service", () => ({
  resolveKeywordLocation: settingsActionMocks.resolveKeywordLocation,
}));
vi.mock("@/lib/actions/rankCheck", () => ({ runCheckNow: settingsActionMocks.runCheckNow }));

export function getSettingsActionMocks() {
  return settingsActionMocks;
}

export function mockSettingsActor(role: "admin" | "member" | "viewer" = "member") {
  settingsActionMocks.requireSession.mockResolvedValue({ user: { id: "user_1" } });
  settingsActionMocks.prisma.user.findUnique.mockResolvedValue({
    memberships: [{ projectId: "project_1", role }],
    role,
  });
}

function mockProject() {
  settingsActionMocks.prisma.project.findFirst.mockResolvedValue({
    id: "project_1",
    ownerId: "user_1",
    publicId: "prj_abcdefghijklmnopqrstuvwx",
  });
}

export function settingsScheduleInput(overrides: Record<string, unknown> = {}) {
  return {
    country: "Germany",
    cronExpression: "0 6 * * *",
    device: "mobile",
    frequency: "weekly",
    jitterMinutes: 60,
    projectId: "prj_abcdefghijklmnopqrstuvwx",
    timezone: "UTC",
    ...overrides,
  };
}

export function resetSettingsActionMocks() {
  vi.clearAllMocks();
  mockSettingsActor();
  mockProject();
  settingsActionMocks.writeAudit.mockResolvedValue({});
  settingsActionMocks.prisma.$transaction.mockImplementation(
    async (callback: (tx: typeof settingsActionMocks.prisma) => Promise<unknown>) =>
      callback(settingsActionMocks.prisma),
  );
  settingsActionMocks.prisma.keyword.findMany.mockResolvedValue([]);
  settingsActionMocks.prisma.keyword.updateMany.mockResolvedValue({ count: 0 });
  settingsActionMocks.resolveKeywordLocation.mockResolvedValue({
    degraded: false,
    location: {
      canonicalKey: "DE",
      cityName: null,
      countryCode: "DE",
      displayName: "Germany",
      id: "loc_de",
      kind: "country",
    },
    warning: null,
  });
  settingsActionMocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
  settingsActionMocks.prisma.projectDefaults.upsert.mockImplementation(({ create }) =>
    Promise.resolve({
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      id: "defaults_1",
      inspectionDailyLimit: 50,
      serpDepth: 100,
      serpStopOnMatch: true,
      updatedAt: new Date("2026-07-02T00:00:00.000Z"),
      ...create,
    }),
  );
}
