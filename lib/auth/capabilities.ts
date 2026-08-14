import type { Role } from "@/lib/generated/prisma/client";

export type Action = "create" | "read" | "update" | "delete" | "manage";

export type ResourceType =
  | "alert_rule"
  | "api_key"
  | "audit_log"
  | "billing"
  | "cloud_import_job"
  | "competitor"
  | "ingest_hook"
  | "keyword"
  | "migration_token"
  | "notification_delivery_channel"
  | "notification_preference"
  | "ownership"
  | "project"
  | "project_defaults"
  | "project_market"
  | "provider_connection"
  | "saved_view"
  | "signal"
  | "sitemap_monitor"
  | "slack_connection"
  | "team"
  | "webhook_endpoint";

const roleRank = {
  viewer: 0,
  auditor: 0.5,
  member: 1,
  admin: 2,
  owner: 3,
} satisfies Record<Role, number>;

const minimumRoleByAction = {
  read: "viewer",
  create: "member",
  update: "member",
  delete: "admin",
  manage: "admin",
} satisfies Record<Action, Role>;

const ownerOnlyResources = new Set<ResourceType>(["billing", "ownership"]);
const adminOnlyCreateDeleteResources = new Set<ResourceType>(["api_key", "ingest_hook"]);

export function requiredRoleFor(
  action: Action,
  resourceType: ResourceType,
  requiredRole?: Role,
): Role {
  if (requiredRole) {
    return requiredRole;
  }
  if (ownerOnlyResources.has(resourceType) || (resourceType === "project" && action === "delete")) {
    return "owner";
  }
  if (adminOnlyCreateDeleteResources.has(resourceType) && ["create", "delete"].includes(action)) {
    return "admin";
  }
  return minimumRoleByAction[action];
}

export function canProjectAction(
  role: Role | null | undefined,
  action: Action,
  resourceType: ResourceType,
  requiredRole?: Role,
): boolean {
  return Boolean(
    role && roleRank[role] >= roleRank[requiredRoleFor(action, resourceType, requiredRole)],
  );
}

export function canReadProjectAudit(role: Role | null | undefined): boolean {
  return role === "auditor" || canProjectAction(role, "manage", "audit_log");
}

export function canDeleteProjectSavedView(
  role: Role | null | undefined,
  actorId: string,
  createdById: string | null,
): boolean {
  return canProjectAction(role, createdById === actorId ? "update" : "delete", "saved_view");
}
