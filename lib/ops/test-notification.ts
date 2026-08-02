import type { OpsConfig } from "./config.ts";
import { type OpsEventInput, postOpsSlackWebhook, redactOpsText } from "./slack.ts";

export type OpsTestNotificationResult =
  | { status: "delivered" }
  | { status: "failed"; error: string }
  | { status: "not_configured" };

export const opsTestNotificationEvent: OpsEventInput = {
  fields: { Source: "instance operator" },
  kind: "test",
  severity: "info",
  title: "bisibility operator observability test",
};

/**
 * Sends a direct webhook probe without touching the durable event outbox.
 * The probe is intentionally best-effort and never exposes or returns the webhook URL.
 */
export async function sendOpsTestNotification(
  config: OpsConfig,
): Promise<OpsTestNotificationResult> {
  if (!config.enabled) {
    return { status: "not_configured" };
  }

  try {
    await postOpsSlackWebhook(config, opsTestNotificationEvent);
    return { status: "delivered" };
  } catch (error) {
    return { error: redactOpsText(error), status: "failed" };
  }
}
