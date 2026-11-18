// Browser fixtures do not contact the authenticated schedule preview action.
export class SchedulePreviewRequestError extends Error {}

export function requestScheduleChangePreview() {
  return {
    capacity: null,
    cost_before_cents: 0,
    cost_after_cents: 0,
    expected_revision: "1",
    preview_token: null,
    requires_review: false,
    review_reasons: [],
    window_start: "2026-10-01T00:00:00.000Z",
  };
}
