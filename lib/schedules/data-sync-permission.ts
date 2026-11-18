import "server-only";
import { type Actor, authorize } from "@/lib/auth/authorize";
import { type Action, canProjectAction, type ResourceType } from "@/lib/auth/capabilities";
import type { Role } from "@/lib/generated/prisma/client";
import type { DataSyncKind } from "./types";

/**
 * Pausing or resuming a data sync needs the same permission as that sync's own control, on every
 * surface (Schedules, the public API and MCP):
 * - Domain Rating: the provider settings switch (`manage provider_connection`), because a resume
 *   spends requests on the configured Ahrefs source.
 * - Sitemap: the sitemap monitor (`update sitemap_monitor`).
 * - Search Console: the import pause and resume controls (`update project`).
 * - Page indexing: the URL inspection budget (`update project_defaults`).
 */
export const dataSyncStatePermissions = {
  domain_rating: { action: "manage", type: "provider_connection" },
  sitemap: { action: "update", type: "sitemap_monitor" },
  search_console: { action: "update", type: "project" },
  page_indexing: { action: "update", type: "project_defaults" },
} as const satisfies Record<DataSyncKind, { action: Action; type: ResourceType }>;

export function dataSyncStatePermission(kind: DataSyncKind) {
  return dataSyncStatePermissions[kind];
}

/** UI gating for a sync's state switch. The server check below stays authoritative. */
export function canSetDataSyncState(role: Role | null | undefined, kind: DataSyncKind) {
  const { action, type } = dataSyncStatePermission(kind);
  return canProjectAction(role, action, type);
}

/** The data sync kinds whose state this role may change, in display order. */
export function settableDataSyncKinds(role: Role | null | undefined): DataSyncKind[] {
  return (Object.keys(dataSyncStatePermissions) as DataSyncKind[]).filter((kind) =>
    canSetDataSyncState(role, kind),
  );
}

/** Throws `AuthorizationError` (403) unless the actor holds this sync's own control permission. */
export function authorizeDataSyncState(actor: Actor, projectId: string, kind: DataSyncKind) {
  const { action, type } = dataSyncStatePermission(kind);
  return authorize(actor, action, { projectId, type });
}
