import "server-only";
import { getAuditRetentionDays } from "@/lib/audit/retention";
import { writeAudit } from "@/lib/auth/audit";
import { type Actor, AuthorizationError, authorize, getProjectRole } from "@/lib/auth/authorize";
import { gravatarUrl } from "@/lib/avatar/gravatar";
import { initials as avatarInitials } from "@/lib/avatar/initials";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { getQueryActor } from "./_auth";
import { type AuditDiff, diffFor } from "./audit-diff";
import { publicAuditTargetIdOrNull, redactAuditIds, requiredPublicId } from "./audit-public-values";
import { formatAuditTimestamp } from "./audit-timestamp";

export type { AuditDiff } from "./audit-diff";
export type AuditOperation = "CREATE" | "DELETE" | "EXPORT" | "IMPORT" | "LOGIN" | "UPDATE";
export type AuditStatus = "failed" | "success";
export type AuditEventType = "auth" | "data" | "export" | "import" | "permissions" | "system";
export type AuditDateRange = "7d" | "30d" | "90d" | "all";
export type AuditEntry = {
  id: string;
  timestamp: string;
  timestampLabel: string;
  eventName: string;
  eventType: AuditEventType;
  actor: {
    avatarUrl?: string | null;
    id: string;
    name: string;
    email: string;
    initials: string;
  };
  resource: {
    id: string | null;
    type: "api_key" | "auth_session" | "export" | "keyword" | "project" | "provider" | "team";
    name: string;
  };
  operation: AuditOperation;
  status: AuditStatus;
  statusReason?: string;
  source: {
    channel: "api" | "oauth" | "ui";
    ip: string;
  };
  diff: AuditDiff[];
  metadata: {
    event_id: string;
    correlation_id: string;
    user_agent: string;
    app_version: string;
  };
};
export type AuditProject = {
  id: string;
  publicId: string;
  domain: string;
  name: string;
};
type AuditProjectRecord = {
  id: string;
  publicId: string;
  domain: string | null;
  name: string;
};
// biome-ignore format: compact view union keeps this module under the line cap.
export type AuditLogView = | { authorized: false; project: AuditProject | null } | { authorized: true; dateRange: AuditDateRange; entries: readonly AuditEntry[]; entryLimit: number; project: AuditProject; retentionDays: number; truncated: boolean };
const AUDIT_ENTRY_LIMIT = 200;
const AUDIT_VIEW_DEBOUNCE_MINUTES = 30;
function operationFor(action: string): AuditOperation {
  if (/delete|revoke|remove|disconnect/.test(action)) {
    return "DELETE";
  }
  if (action.includes("export")) {
    return "EXPORT";
  }
  if (action.includes("import")) {
    return "IMPORT";
  }
  if (/sign_in|login/.test(action)) {
    return "LOGIN";
  }
  if (/add|create|issue|connect|run_now/.test(action)) {
    return "CREATE";
  }
  return "UPDATE";
}
function auditProjectView(project: AuditProjectRecord): AuditProject {
  return {
    domain: trackedProjectDomain(project.domain) ?? "",
    id: project.publicId,
    name: project.name,
    publicId: project.publicId,
  };
}
function eventTypeFor(action: string): AuditEventType {
  if (action.startsWith("auth")) {
    return "auth";
  }
  if (action.startsWith("api_key")) {
    return "permissions";
  }
  if (action.includes("export")) {
    return "export";
  }
  if (action.includes("import")) {
    return "import";
  }
  if (
    action.startsWith("audit_log") ||
    action.startsWith("provider") ||
    action.includes("schedule") ||
    action.includes("defaults")
  ) {
    return "system";
  }
  return "data";
}
const RESOURCE_TYPE_BY_TARGET: Record<string, AuditEntry["resource"]["type"]> = {
  api_key: "api_key",
  auth_session: "auth_session",
  keyword: "keyword",
  keyword_schedule: "keyword",
  membership: "team",
  project: "project",
  project_defaults: "project",
  provider_connection: "provider",
  rank_check: "keyword",
  session: "auth_session",
  user: "auth_session",
};
function resourceTypeFor(targetType: string): AuditEntry["resource"]["type"] {
  return RESOURCE_TYPE_BY_TARGET[targetType] ?? "project";
}
function eventNameFor(action: string): string {
  const words = action.replace(/[._]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
type AuditRow = {
  id: string;
  publicId: string | null;
  action: string;
  appVersion: string | null;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  correlationId: string | null;
  createdAt: Date;
  sourceIpMasked: string | null;
  status: string;
  statusReason: string | null;
  userAgent: string | null;
  actor: { email: string; name: string | null; publicId: string | null } | null;
};
function statusFor(status: string): AuditStatus {
  return status === "failed" ? "failed" : "success";
}
function recorded(value: string | null) {
  return value?.trim() || "Not recorded";
}
function safeMetadataId(value: string | null) {
  const redacted = redactAuditIds(value, "correlation_id");
  return typeof redacted === "string" ? recorded(redacted) : "Not recorded";
}
// AuditLog has no source-channel column, so derive it from the recorded user agent:
// browser engines mean the action came through the UI, anything else is a programmatic API caller.
function channelFor(userAgent: string | null): AuditEntry["source"]["channel"] {
  if (!userAgent) {
    return "api";
  }
  return /mozilla|gecko|webkit|chrome|safari|firefox|edg/i.test(userAgent) ? "ui" : "api";
}
function mapAuditRow(row: AuditRow): AuditEntry {
  const name = row.actor?.name?.trim() || (row.actor ? row.actor.email : "System");
  const email = row.actor?.email ?? "system@bisibility";
  return {
    actor: {
      avatarUrl: row.actor ? gravatarUrl(email, 26) : null,
      email,
      id: row.actor ? requiredPublicId(row.actor.publicId, "Audit actor", "usr") : "system",
      initials: avatarInitials(name, email),
      name,
    },
    diff: diffFor(redactAuditIds(row.before), redactAuditIds(row.after)),
    eventName: eventNameFor(row.action),
    eventType: eventTypeFor(row.action),
    id: requiredPublicId(row.publicId, "Audit log", "audit"),
    metadata: {
      app_version: recorded(row.appVersion),
      correlation_id: safeMetadataId(row.correlationId),
      event_id: requiredPublicId(row.publicId, "Audit log", "audit"),
      user_agent: recorded(row.userAgent),
    },
    operation: operationFor(row.action),
    resource: {
      id: publicAuditTargetIdOrNull(row.targetId, row.targetType),
      name: publicAuditTargetIdOrNull(row.targetId, row.targetType) ?? "Resource unavailable",
      type: resourceTypeFor(row.targetType),
    },
    source: { channel: channelFor(row.userAgent), ip: recorded(row.sourceIpMasked) },
    status: statusFor(row.status),
    statusReason: row.statusReason ?? undefined,
    timestamp: row.createdAt.toISOString(),
    timestampLabel: formatAuditTimestamp(row.createdAt),
  };
}
const DATE_RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 } satisfies Record<
  Exclude<AuditDateRange, "all">,
  number
>;
function normalizeDateRange(value: string | string[] | undefined): AuditDateRange {
  return value === "7d" || value === "90d" || value === "all" ? value : "30d";
}
function dateRangeCutoff(dateRange: AuditDateRange): Date | null {
  if (dateRange === "all") {
    return null;
  }
  return new Date(Date.now() - DATE_RANGE_DAYS[dateRange] * 24 * 60 * 60 * 1000);
}
async function loadAuditEntries(projectId: string, cutoff: Date | null) {
  const rows = await prisma.auditLog.findMany({
    include: { actor: { select: { email: true, name: true, publicId: true } } },
    orderBy: { createdAt: "desc" },
    take: AUDIT_ENTRY_LIMIT + 1,
    where: { projectId, ...(cutoff ? { createdAt: { gte: cutoff } } : {}) },
  });
  return {
    entries: rows.slice(0, AUDIT_ENTRY_LIMIT).map(mapAuditRow),
    truncated: rows.length > AUDIT_ENTRY_LIMIT,
  };
}
function assertCanReadAudit(actor: Actor, projectId: string) {
  const role = getProjectRole(actor, projectId);
  if (role === "auditor") {
    return;
  }
  authorize(actor, "manage", { projectId, requiredRole: "admin", type: "audit_log" });
}
async function writeAuditView(actor: Actor, project: AuditProjectRecord) {
  const viewedAfter = new Date(Date.now() - AUDIT_VIEW_DEBOUNCE_MINUTES * 60 * 1000);
  const existing = await prisma.auditLog.findFirst({
    select: { id: true },
    where: {
      action: "audit_log.view",
      actorId: actor.id,
      createdAt: { gte: viewedAfter },
      projectId: project.id,
      targetId: project.publicId,
    },
  });
  if (existing) {
    return;
  }
  await writeAudit({
    action: "audit_log.view",
    actorId: actor.id,
    projectId: project.id,
    targetId: project.publicId,
    targetType: "project",
  });
}
export async function getAuditLogView(
  projectId: string,
  options?: { dateRange?: string | string[] },
): Promise<AuditLogView> {
  if (parsePublicId(projectId)?.prefix !== "prj") throw new Error("Project not found.");
  const actor = await getQueryActor();
  const project = await prisma.project.findFirst({
    select: { domain: true, id: true, name: true, publicId: true },
    where: { publicId: projectId },
  });
  if (!project) {
    throw new Error("Project not found.");
  }
  try {
    assertCanReadAudit(actor, project.id);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { authorized: false, project: auditProjectView(project) };
    }
    throw error;
  }
  await writeAuditView(actor, project);
  const dateRange = normalizeDateRange(options?.dateRange);
  const { entries, truncated } = await loadAuditEntries(project.id, dateRangeCutoff(dateRange));
  return {
    authorized: true,
    dateRange,
    entries,
    entryLimit: AUDIT_ENTRY_LIMIT,
    project: auditProjectView(project),
    retentionDays: getAuditRetentionDays(),
    truncated,
  };
}
