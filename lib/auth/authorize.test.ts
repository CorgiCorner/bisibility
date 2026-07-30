import type { Role } from "@/lib/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeAuditFailure } from "./audit";
import {
  type Action,
  AuthorizationError,
  authorize,
  canManageWorkspace,
  getProjectRole,
  type Resource,
} from "./authorize";

vi.mock("server-only", () => ({}));

vi.mock("./audit", () => ({
  writeAuditFailure: vi.fn(() => Promise.resolve({ id: "audit_failure_1" })),
}));

const roles = ["viewer", "auditor", "member", "admin", "owner"] as const satisfies readonly Role[];
const actions = [
  "read",
  "create",
  "update",
  "delete",
  "manage",
] as const satisfies readonly Action[];

const roleRank = {
  admin: 2,
  auditor: 0.5,
  member: 1,
  owner: 3,
  viewer: 0,
} satisfies Record<Role, number>;

const minimumRoleByAction = {
  create: "member",
  delete: "admin",
  manage: "admin",
  read: "viewer",
  update: "member",
} satisfies Record<Action, Role>;

type ResourceClass = {
  name: string;
  requiredRole: (action: Action) => Role;
  resource: Resource;
};

const resourceClasses = [
  {
    name: "project",
    requiredRole: (action) => (action === "delete" ? "owner" : minimumRoleByAction[action]),
    resource: { projectId: "project_1", type: "project" },
  },
  {
    name: "keyword",
    requiredRole: (action) => minimumRoleByAction[action],
    resource: { projectId: "project_1", type: "keyword" },
  },
  {
    name: "team",
    requiredRole: (action) => minimumRoleByAction[action],
    resource: { projectId: "project_1", type: "team" },
  },
  {
    name: "billing",
    requiredRole: () => "owner",
    resource: { projectId: "project_1", type: "billing" },
  },
  {
    name: "ownership",
    requiredRole: () => "owner",
    resource: { projectId: "project_1", type: "ownership" },
  },
] satisfies readonly ResourceClass[];

const matrixCases = roles.flatMap((role) =>
  actions.flatMap((action) =>
    resourceClasses.map((resourceClass) => {
      const requiredRole = resourceClass.requiredRole(action);
      return {
        action,
        allowed: roleRank[role] >= roleRank[requiredRole],
        requiredRole,
        resourceClass,
        role,
      };
    }),
  ),
);

function actorWith(role: Role, projectId = "project_1") {
  return {
    id: "user_1",
    memberships: [{ projectId, role }],
    role,
  };
}

describe("authorize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("RBAC matrix", () => {
    it.each(matrixCases)(
      "$role $action on $resourceClass.name allowed=$allowed",
      ({ action, allowed, requiredRole, resourceClass, role }) => {
        const actor = actorWith(role);

        if (allowed) {
          expect(authorize(actor, action, resourceClass.resource)).toEqual({
            actorId: "user_1",
            projectId: "project_1",
            role,
          });
          expect(writeAuditFailure).not.toHaveBeenCalled();
          return;
        }

        expect(() => authorize(actor, action, resourceClass.resource)).toThrow(AuthorizationError);
        expect(writeAuditFailure).toHaveBeenCalledWith(
          expect.objectContaining({
            action: `authorization.${action}.forbidden`,
            actorId: "user_1",
            after: {
              attemptedAction: action,
              grantedRole: role,
              requiredRole,
              resourceType: resourceClass.resource.type,
            },
            projectId: "project_1",
            statusReason: "forbidden",
            targetId: "project-scope",
            targetType: "authorization",
          }),
        );
      },
    );
  });

  it("denies unauthenticated actors without writing a forbidden audit", () => {
    for (const action of actions) {
      for (const resourceClass of resourceClasses) {
        vi.clearAllMocks();

        expect(() => authorize(null, action, resourceClass.resource)).toThrow(
          "Authentication is required.",
        );
        expect(writeAuditFailure).not.toHaveBeenCalled();
      }
    }
  });

  it("denies project resources without a membership and writes a forbidden audit", () => {
    const actor = { id: "user_1", memberships: [], role: null };

    for (const action of actions) {
      for (const resourceClass of resourceClasses) {
        vi.clearAllMocks();
        const requiredRole = resourceClass.requiredRole(action);

        expect(() => authorize(actor, action, resourceClass.resource)).toThrow(AuthorizationError);
        expect(writeAuditFailure).toHaveBeenCalledWith(
          expect.objectContaining({
            action: `authorization.${action}.forbidden`,
            actorId: "user_1",
            after: {
              attemptedAction: action,
              grantedRole: null,
              requiredRole,
              resourceType: resourceClass.resource.type,
            },
            projectId: "project_1",
            statusReason: "forbidden",
            targetId: "project-scope",
            targetType: "authorization",
          }),
        );
      }
    }
  });

  it("honors explicit requiredRole overrides and audits the effective requirement", () => {
    expect(() =>
      authorize(actorWith("admin"), "manage", {
        projectId: "project_1",
        requiredRole: "owner",
        type: "team",
      }),
    ).toThrow(AuthorizationError);

    expect(writeAuditFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "authorization.manage.forbidden",
        after: {
          attemptedAction: "manage",
          grantedRole: "admin",
          requiredRole: "owner",
          resourceType: "team",
        },
        projectId: "project_1",
        targetType: "authorization",
      }),
    );
  });
});

describe("canManageWorkspace", () => {
  it("is false for missing roles", () => {
    expect(canManageWorkspace(null)).toBe(false);
    expect(canManageWorkspace(undefined)).toBe(false);
  });

  it.each(roles)("matches authorize's project manage decision for %s", (role) => {
    const managesViaAuthorize = (() => {
      try {
        authorize(actorWith(role), "manage", { projectId: "project_1", type: "project" });
        return true;
      } catch {
        return false;
      }
    })();

    expect(canManageWorkspace(role)).toBe(managesViaAuthorize);
  });
});

describe("getProjectRole", () => {
  it("returns the membership role for the requested project", () => {
    const actor = {
      id: "user_1",
      memberships: [
        { projectId: "project_1", role: "viewer" },
        { projectId: "project_2", role: "admin" },
      ],
    } satisfies Parameters<typeof getProjectRole>[0];

    expect(getProjectRole(actor, "project_2")).toBe("admin");
  });

  it.each([undefined, null, "project_missing"])(
    "returns null when no matching project role exists for %s",
    (projectId) => {
      expect(getProjectRole(actorWith("owner"), projectId)).toBeNull();
    },
  );
});
