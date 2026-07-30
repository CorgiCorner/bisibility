export const MAX_ALERT_RULES_PER_PROJECT = 50;
// Bound the endpoint fan-out multiplier for every webhook delivery batch.
export const MAX_WEBHOOK_ENDPOINTS_PER_PROJECT = 10;
// A digest or immediate single-alert send consumes one unit, regardless of channel count.
export const MAX_ALERT_DELIVERIES_PER_RULE_PER_DAY = 20;
// Additional entries remain in the webhook body and are summarized in visible messages.
export const ALERT_DIGEST_MAX_ITEMS = 20;
// Bound workflow payloads while deferring additional alerts to the next flush.
export const ALERT_DIGEST_JOB_MAX_ALERTS = 200;
export const PENDING_ALERT_FLUSH_BATCH_LIMIT = 500;
// This must remain greater than the five-minute flush activity timeout.
export const STALE_DIGEST_CLAIM_MINUTES = 30;
