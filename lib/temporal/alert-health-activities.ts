import "server-only";

import {
  collectAlertDeliveryHealth,
  collectAlertFireSpikes,
  getAlertHealthConfig,
} from "../alerts/health";
import { getOpsConfig } from "../ops/config";
import { ruleLabel } from "../ops/labels";
import { notifyOps } from "../ops/notify";

export type AlertHealthActivityResult = {
  deliveryAlarm: boolean;
  deliveryAttempts: number;
  deliveryFailureRate: number;
  spikes: number;
  status: "completed" | "disabled";
};

function disabledResult(): AlertHealthActivityResult {
  return {
    deliveryAlarm: false,
    deliveryAttempts: 0,
    deliveryFailureRate: 0,
    spikes: 0,
    status: "disabled",
  };
}

export async function alertHealthActivity(): Promise<AlertHealthActivityResult> {
  if (!getOpsConfig().enabled) return disabledResult();
  const config = getAlertHealthConfig();
  const now = new Date();
  const [delivery, spikes] = await Promise.all([
    collectAlertDeliveryHealth(now, config),
    collectAlertFireSpikes(now, config),
  ]);
  if (delivery.alarm) {
    await notifyOps({
      dedupeKey: "alert-health:delivery",
      fields: {
        Failed: delivery.failed,
        "Failure rate": delivery.failureRate,
        Total: delivery.total,
        Window: `${delivery.windowHours} hours`,
        ...Object.fromEntries(
          Object.entries(delivery.perChannel).map(([channel, counts]) => [
            channel,
            `${counts.failed} failed / ${counts.total} attempted / ${counts.skipped} skipped`,
          ]),
        ),
      },
      kind: "alert_delivery_health",
      severity: "error",
      title: "Alert delivery failure rate high",
    });
  }
  for (const spike of spikes) {
    await notifyOps({
      dedupeKey: `alert-health:fire:${spike.ruleId}`,
      fields: {
        Project: spike.projectId,
        Rule: ruleLabel(spike.ruleId, spike.ruleName),
        Today: spike.today,
        "Trailing daily average": spike.trailingDailyAvg,
      },
      kind: "alert_fire_spike",
      severity: "warning",
      title: "Alert rule firing spike",
    });
  }
  return {
    deliveryAlarm: delivery.alarm,
    deliveryAttempts: delivery.total,
    deliveryFailureRate: delivery.failureRate,
    spikes: spikes.length,
    status: "completed",
  };
}
