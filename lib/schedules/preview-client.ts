import type { ScheduleActionFailure } from "./action-result";
import { isScheduleActionFailure } from "./action-result";
import type { ScheduleChange, ScheduleChangePreview } from "./preview";

export class SchedulePreviewRequestError extends Error {}

function isPreview(value: unknown): value is ScheduleChangePreview {
  if (!value || typeof value !== "object") return false;
  const preview = value as Partial<ScheduleChangePreview>;
  const cents = (amount: unknown) =>
    amount === null || (typeof amount === "number" && Number.isFinite(amount));
  return (
    typeof preview.requires_review === "boolean" &&
    Array.isArray(preview.review_reasons) &&
    typeof preview.expected_revision === "string" &&
    typeof preview.window_start === "string" &&
    (preview.preview_token === null || typeof preview.preview_token === "string") &&
    (!preview.requires_review || Boolean(preview.preview_token)) &&
    cents(preview.cost_before_cents) &&
    cents(preview.cost_after_cents)
  );
}

/** Browser transport for previewScheduleChangeAction; no server implementation enters the bundle. */
export async function requestScheduleChangePreview(input: {
  projectId: string;
  change: ScheduleChange;
}): Promise<ScheduleChangePreview | ScheduleActionFailure> {
  try {
    const response = await fetch("/api/check-schedules/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "data" in body) {
      const value = body.data;
      if (isScheduleActionFailure(value)) return value;
      if (response.ok && isPreview(value)) return value;
    }
    throw new SchedulePreviewRequestError();
  } catch (error) {
    if (error instanceof SchedulePreviewRequestError) throw error;
    throw new SchedulePreviewRequestError();
  }
}
