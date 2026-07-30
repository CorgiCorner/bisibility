import "server-only";

import {
  type Action,
  canProjectAction,
  type ResourceType,
  requiredRoleFor,
} from "@/lib/auth/capabilities";
import type { Role } from "@/lib/generated/prisma/client";
import { writeAuditFailure } from "./audit";

export type { Action, ResourceType } from "@/lib/auth/capabilities";

export class AuthorizationError extends Error {
  constructor(
    public readonly code: "unauthenticated" | "forbidden",
    message = "You are not authorized to perform this action.",
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export type MembershipFact = {
  projectId: string;
  role: Role;
};

export type Actor = {
  id: string;
  memberships?: readonly MembershipFact[];
  role?: Role | null;
};

export type Resource = {
  projectId?: string | null;
  requiredRole?: Role;
  type: ResourceType;
  ownerId?: string | null;
};

export type AuthorizationGrant = {
  actorId: string;
  projectId?: string;
  role: Role;
};

/**
 * UI manage gating shares the server authorization table; server checks remain authoritative.
 */
export function canManageWorkspace(role: Role | null | undefined): boolean {
  return canProjectAction(role, "manage", "project");
}

export function getProjectRole(actor: Actor, projectId: string | null | undefined): Role | null {
  if (!projectId) {
    return null;
  }

  const membership = actor.memberships?.find((item) => item.projectId === projectId);

  return membership?.role ?? null;
}

function resourceRole(actor: Actor, resource: Resource) {
  const membershipRole = getProjectRole(actor, resource.projectId);

  if (resource.projectId) {
    return membershipRole;
  }

  if (resource.ownerId && resource.ownerId === actor.id) {
    return "owner";
  }

  return actor.role ?? null;
}

function auditForbidden(actor: Actor, action: Action, resource: Resource, role: Role | null) {
  const targetId = resource.projectId
    ? "project-scope"
    : resource.ownerId
      ? "owner-scope"
      : "unknown-scope";

  void writeAuditFailure({
    action: `authorization.${action}.forbidden`,
    actorId: actor.id,
    after: {
      attemptedAction: action,
      grantedRole: role,
      requiredRole: resource.requiredRole,
      resourceType: resource.type,
    },
    projectId: resource.projectId,
    statusReason: "forbidden",
    targetId,
    targetType: "authorization",
  }).catch(() => undefined);
}

export function authorize(
  actor: Actor | null,
  action: Action,
  resource: Resource,
): AuthorizationGrant {
  if (!actor) {
    throw new AuthorizationError("unauthenticated", "Authentication is required.");
  }

  const role = resourceRole(actor, resource);
  const requiredRole = requiredRoleFor(action, resource.type, resource.requiredRole);

  if (!role || !canProjectAction(role, action, resource.type, resource.requiredRole)) {
    auditForbidden(actor, action, { ...resource, requiredRole }, role);
    throw new AuthorizationError("forbidden");
  }

  return {
    actorId: actor.id,
    projectId: resource.projectId ?? undefined,
    role,
  };
}
