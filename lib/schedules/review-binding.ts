import type { Actor } from "@/lib/auth/authorize";
import type { SettingsQuoteBinding } from "@/lib/measurement-settings/host/quote-binding";
import type { ScheduleSpendDecision } from "./review-decision";
import type { ScheduleChange } from "./review-load";

export type ScheduleReviewPrincipal = Actor | { projectKeyId: string };

/** Keep human quotes compatible and distinguish a key from every user and other key. */
export function scheduleReviewIdentity(principal: ScheduleReviewPrincipal) {
  return "projectKeyId" in principal
    ? { subject: `project_key:${principal.projectKeyId}`, actorId: null }
    : { subject: principal.id, actorId: principal.id };
}

/** The signed claim. A client consent summary is deliberately absent. */
export function scheduleReviewBinding(
  projectId: string,
  actorId: string,
  change: ScheduleChange,
  revision: string,
  decision: Pick<
    ScheduleSpendDecision,
    "cost_after_cents" | "cost_before_cents" | "review_reasons"
  > & { window_start: string },
): SettingsQuoteBinding {
  const claim = {
    change,
    cost_after_cents: decision.cost_after_cents,
    cost_before_cents: decision.cost_before_cents,
    review_reasons: decision.review_reasons,
    revision,
    window_start: decision.window_start,
  };
  return {
    actorId,
    depth: 100,
    projectId,
    providerId: null,
    selection: claim,
    source: claim,
  };
}
