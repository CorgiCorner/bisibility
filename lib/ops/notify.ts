import { getOpsConfig, shouldNotifyOpsSuccess } from "@/lib/ops/config";
import {
  type OpsEventInput,
  postOpsSlackWebhook,
  redactOpsText,
  sanitizeOpsEvent,
} from "@/lib/ops/slack";
import { drainOpsThrottleCounters, opsEventIsThrottled } from "@/lib/ops/throttle";

let disabledLogged = false;

function logDisabledOnce() {
  if (disabledLogged) return;
  disabledLogged = true;
  console.debug("[ops] notifications disabled");
}

function logFailure(error: unknown) {
  console.error(`[ops] notification failed: ${redactOpsText(error)}`);
}

async function opsEventStore() {
  const { prisma } = await import("@/lib/db/prisma");
  return prisma.opsEvent;
}

export async function deliverPersistedOpsEvent(event: {
  fields: unknown;
  id: string;
  kind: string;
  severity: string;
  title: string;
}) {
  const config = getOpsConfig();
  if (!config.enabled) {
    logDisabledOnce();
    return false;
  }
  const store = await opsEventStore().catch((error) => {
    logFailure(error);
    return null;
  });
  if (!store) return false;
  try {
    await postOpsSlackWebhook(config, {
      fields:
        event.fields && typeof event.fields === "object" && !Array.isArray(event.fields)
          ? (event.fields as Record<string, unknown>)
          : undefined,
      kind: event.kind,
      severity:
        event.severity === "error" || event.severity === "warning" ? event.severity : "info",
      title: event.title,
    });
    await store.update({
      data: { attempts: { increment: 1 }, deliveredAt: new Date(), lastError: null },
      where: { id: event.id },
    });
    return true;
  } catch (error) {
    const message = redactOpsText(error);
    await store
      .update({
        data: { attempts: { increment: 1 }, lastError: message },
        where: { id: event.id },
      })
      .catch(logFailure);
    logFailure(error);
    return false;
  }
}

export async function notifyOps(input: OpsEventInput): Promise<void> {
  const config = getOpsConfig();
  if (!config.enabled) {
    logDisabledOnce();
    return;
  }

  try {
    if (input.dedupeKey) {
      const throttled = await opsEventIsThrottled(input.dedupeKey, config.throttleMinutes).catch(
        (error) => {
          logFailure(error);
          return false;
        },
      );
      if (throttled) return;
    }

    const event = sanitizeOpsEvent(input);
    const store = await opsEventStore();
    const persisted = await store.create({
      data: {
        dedupeKey: event.dedupeKey,
        fields: event.fields,
        kind: event.kind,
        severity: event.severity,
        title: event.title,
      },
    });
    await deliverPersistedOpsEvent(persisted);
  } catch (error) {
    logFailure(error);
  }
}

export { drainOpsThrottleCounters, shouldNotifyOpsSuccess };

export function resetOpsNotifyStateForTests() {
  disabledLogged = false;
}
