import "server-only";
import { signSettingsQuote } from "@/lib/measurement-settings/host/quote-binding";
import { previewScheduleCapacity } from "./preview-capacity";
import {
  type ScheduleReviewPrincipal,
  scheduleReviewBinding,
  scheduleReviewIdentity,
} from "./review-binding";
import { reviewWindow } from "./review-cost";
import { assessScheduleSpend } from "./review-decision";
import { loadScheduleSpend, type ScheduleChange } from "./review-load";
import type { ScheduleChangePreview } from "./review-preview";

export type { ScheduleChangePreview } from "./review-preview";
export type { ScheduleChange };

/** Projected spend for a schedule mutation. A token is issued only when review is required. */
export async function previewScheduleChange(
  projectId: string,
  actor: ScheduleReviewPrincipal,
  change: ScheduleChange,
  now = new Date(),
  windowStart?: Date,
): Promise<ScheduleChangePreview> {
  const { subject } = scheduleReviewIdentity(actor);
  if (!subject.trim()) throw new Error("Schedule review requires an actor.");
  const loaded = await loadScheduleSpend(projectId, change, now);
  const start = windowStart ?? reviewWindow(now).start;
  loaded.spend.windowStart = start;
  const decision = assessScheduleSpend(loaded.spend);
  const preview: ScheduleChangePreview = {
    ...decision,
    capacity: await previewScheduleCapacity(projectId, change, loaded.spend),
    expected_revision: loaded.revision,
    preview_token: null,
    window_start: start.toISOString(),
  };
  if (!decision.requires_review) return preview;
  preview.preview_token = signSettingsQuote(
    "schedule",
    scheduleReviewBinding(
      projectId,
      subject,
      loaded.bindingChange ?? change,
      loaded.revision,
      preview,
    ),
    now,
  ).token;
  return preview;
}
