import "server-only";
import { withProjectKeyAudit } from "@/lib/auth/audit";
import type { ScheduleReviewPrincipal } from "@/lib/schedules/review-binding";
import { type ApiContext, requireApiActor } from "./context";

type ScheduleApiContext = Pick<ApiContext, "actor" | "auth" | "origin">;

/**
 * The subject a REST schedule review binds. The router lets a project key act as the project
 * owner, so a key must bind its own identity: its previews, permits and receipts can never be
 * redeemed by the owner, another user or another key, nor theirs by the key.
 */
export function apiScheduleReviewer(ctx: ScheduleApiContext): ScheduleReviewPrincipal {
  return ctx.origin.credentialKind === "project_key"
    ? { projectKeyId: ctx.origin.credentialId }
    : requireApiActor(ctx);
}

/** Attribute the audits of a project key schedule write to the key, never to the owner. */
export function withApiScheduleAudit<T>(ctx: ScheduleApiContext, run: () => Promise<T>) {
  if (ctx.origin.credentialKind !== "project_key") return run();
  return withProjectKeyAudit(
    {
      creatorId: requireApiActor(ctx).id,
      credentialId: ctx.origin.credentialId,
      projectId: ctx.auth.project.id,
    },
    run,
  );
}
