import "server-only";
import { authorize } from "@/lib/auth/authorize";
import { type Action, type ResourceType, requiredRoleFor } from "@/lib/auth/capabilities";
import { dataSyncStatePermission } from "@/lib/schedules/data-sync-permission";
import type { ScheduleChange } from "@/lib/schedules/preview";
import { trackingScope } from "./ai-tracking-service";
import { type ApiContext, projectScopes, requireApiActor } from "./context";
import { ApiForbiddenError } from "./errors";
import { hasApiScope } from "./scope-policy";

type Permission = { action: Action; type: ResourceType };

/**
 * The permission the web requires for the same change (base `1e993a2ac1`):
 * - rank create, edit, pause and resume: `update check_schedule` (`lib/actions/check-schedule.ts`);
 * - rank archive and restore: `manage check_schedule`
 *   (`app/api/check-schedules/[publicId]/archive/route.ts`, `restore/route.ts`);
 * - keyword membership: `update check_schedule` (`app/api/check-schedules/[publicId]/keywords`);
 * - keyword create: `create keyword` (`project_market` for a market create);
 * - local monitor state: `update local_measurement_run` (`lib/actions/schedule-review.ts`);
 * - data sync state: that sync's own control (`lib/schedules/data-sync-permission.ts`);
 * - legacy keyword cadence: `update keyword`, as on the keyword endpoints.
 * AI schedules keep the Prompt Tracker scope check.
 */
export function publicScheduleChangePermission(change: ScheduleChange): Permission | null {
  if (change.op === "state") {
    const { command } = change;
    if (command.kind === "ai") return null;
    if (command.kind === "data_sync") return dataSyncStatePermission(command.syncKind);
    if (command.kind === "local_monitor")
      return { action: "update", type: "local_measurement_run" };
    const restore = "restore" in command && command.restore === true;
    return {
      action: change.state === "archived" || restore ? "manage" : "update",
      type: "check_schedule",
    };
  }
  if (change.op === "create" || change.op === "update") {
    if (change.body.kind === "ai") return null;
    if (change.body.kind === "data_sync") return dataSyncStatePermission(change.body.syncKind);
    return { action: "update", type: "check_schedule" };
  }
  if (change.op === "keywords-create")
    return {
      action: "create",
      type: change.source?.kind === "market-create" ? "project_market" : "keyword",
    };
  if (change.op === "keywords") return { action: "update", type: "check_schedule" };
  if (change.op === "delete") return { action: "manage", type: "check_schedule" };
  return { action: "update", type: "keyword" };
}

/**
 * Throws 403 unless the caller holds the web permission for this change. A project key carries
 * its creator's role capped at admin, and an admin-only change also needs the key's admin scope,
 * the same rule the MCP schedule tools apply.
 */
export async function authorizePublicScheduleChange(ctx: ApiContext, change: ScheduleChange) {
  const actor = requireApiActor(ctx);
  const permission = publicScheduleChangePermission(change);
  if (!permission) {
    await trackingScope(actor, ctx.auth.project.publicId, true);
    return;
  }
  if (
    ctx.origin.credentialKind === "project_key" &&
    requiredRoleFor(permission.action, permission.type) === "admin" &&
    !hasApiScope(projectScopes(ctx.auth), "admin")
  )
    throw new ApiForbiddenError("API key scope does not allow this operation.");
  authorize(actor, permission.action, { projectId: ctx.auth.project.id, type: permission.type });
}
