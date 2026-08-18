import {
  formatOpsSlackPayload,
  redactOpsText,
} from "../../lib/ops/slack.ts";
import {
  opsTestNotificationEvent,
  sendOpsTestNotification,
} from "../../lib/ops/test-notification.ts";

async function main() {
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify(formatOpsSlackPayload(opsTestNotificationEvent), null, 2));
    return;
  }

  const webhookUrl = process.env.OPS_SLACK_WEBHOOK_URL?.trim() || null;
  const result = await sendOpsTestNotification({
    enabled: Boolean(webhookUrl),
    heartbeatCron: "0 8 * * *",
    heartbeatTimezone: "Etc/UTC",
    includeNames: false,
    notifyMode: "failures",
    throttleMinutes: 60,
    webhookUrl,
  });
  if (result.status === "not_configured") {
    throw new Error("Set OPS_SLACK_WEBHOOK_URL first.");
  }
  if (result.status === "failed") throw new Error(result.error);
  console.log("Ops Slack test notification delivered.");
}

main().catch((error) => {
  console.error(`Ops Slack test notification failed: ${redactOpsText(error)}`);
  process.exitCode = 1;
});
