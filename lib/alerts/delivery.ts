import "server-only";
import { createHmac } from "node:crypto";
import type { LookupAddress } from "node:dns";
import type { LookupFunction } from "node:net";
import { prisma } from "@/lib/db/prisma";
import { escapeHtml } from "@/lib/email/escape-html";
import { alertsEmailFrom } from "@/lib/email/from";
import {
  notificationUnsubscribeFooter,
  notificationUnsubscribeUrl,
} from "@/lib/email/notification-unsubscribe";
import { sendEmail } from "@/lib/email/send";
import { Prisma } from "@/lib/generated/prisma/client";
import { parseRetryAfterSeconds } from "@/lib/http/retry-after";
import { decryptSecret } from "@/lib/providers/crypto";
import { resolveCanonicalOrigin } from "@/lib/seo/origin";
import { Agent, type Dispatcher } from "undici";
import type { TriggeredAlertDeliveryPayload } from "./alert-delivery-payload";
import type { DeliveryCounts } from "./delivery-counts";
import { DeliveryHttpError } from "./delivery-http-error";
import { buildAlertFiredWebhookBody, buildWebhookTestBody } from "./webhook-envelope";
import {
  resolveAllowedWebhookAddresses,
  type WebhookGuardOptions,
  type WebhookResolvedAddress,
} from "./webhook-guard";

export type {
  AlertExternalDeliveryPayload,
  TriggeredAlertDeliveryPayload,
} from "./alert-delivery-payload";
export { DeliveryHttpError } from "./delivery-http-error";
export type { AlertFiredWebhookEnvelope } from "./webhook-envelope";
export { buildAlertFiredWebhookBody } from "./webhook-envelope";

const SLACK_POST_MESSAGE_ENDPOINT = "https://slack.com/api/chat.postMessage";
const MAX_DELIVERY_ERROR_LENGTH = 500;
const DELIVERY_FETCH_TIMEOUT_MS = 10_000;

export type AlertDeliveryChannel = "email" | "push" | "slack" | "webhook";

export type AlertWebhookEndpoint = {
  hmacSecret: string;
  id: string;
  publicId?: string | null;
  url: string;
};

function signWebhookBody(body: string, encryptedSecret: string, timestamp: string) {
  const secret = decryptSecret(encryptedSecret);
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export async function postSignedBody(
  endpoint: AlertWebhookEndpoint,
  value: unknown,
  guardOptions: WebhookGuardOptions = {},
) {
  const vetted = await resolveAllowedWebhookAddresses(endpoint.url, guardOptions);
  const dispatcher = vetted.length > 0 ? pinnedAgent(vetted) : undefined;

  try {
    const startedAt = performance.now();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify(value);
    const signature = signWebhookBody(body, endpoint.hmacSecret, timestamp);
    const init: RequestInit & { dispatcher?: Dispatcher } = {
      body,
      dispatcher,
      headers: {
        "Content-Type": "application/json",
        "X-Bisibility-Signature": `sha256=${signature}`,
        "X-Bisibility-Timestamp": timestamp,
      },
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(DELIVERY_FETCH_TIMEOUT_MS),
    };
    const response = await fetch(endpoint.url, init);
    const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));

    if (!response.ok) {
      throw new DeliveryHttpError(
        `Webhook delivery failed with status ${response.status}.`,
        response.status,
        parseRetryAfterSeconds(response.headers.get("Retry-After")),
        latencyMs,
      );
    }
    return { latencyMs, status: response.status };
  } finally {
    await dispatcher?.close();
  }
}

export async function postSignedWebhook(
  endpoint: AlertWebhookEndpoint,
  payload: TriggeredAlertDeliveryPayload,
  guardOptions: WebhookGuardOptions = {},
) {
  return postSignedBody(endpoint, buildAlertFiredWebhookBody(payload), guardOptions);
}

export async function postSignedWebhookTest(
  endpoint: AlertWebhookEndpoint,
  data: { projectDomain: string; projectId: string; webhookId?: string | null },
  guardOptions: WebhookGuardOptions = {},
) {
  return postSignedBody(endpoint, buildWebhookTestBody(data), guardOptions);
}

function pinnedAgent(vetted: WebhookResolvedAddress[]) {
  const addresses: LookupAddress[] = vetted.map(({ address, family }) => ({
    address,
    family: family === 6 || address.includes(":") ? 6 : 4,
  }));
  const lookup: LookupFunction = (_hostname, options, callback) => {
    if (options.all) {
      const allCallback = callback as (
        error: NodeJS.ErrnoException | null,
        addresses: LookupAddress[],
      ) => void;
      allCallback(null, addresses);
      return;
    }
    const first = addresses[0];
    const oneCallback = callback as (
      error: NodeJS.ErrnoException | null,
      address: string,
      family: number,
    ) => void;
    oneCallback(null, first.address, first.family);
  };
  return new Agent({ connect: { lookup } });
}

export async function sendAlertEmail(
  recipient: { email: string; userId: string; projectId: string },
  payload: TriggeredAlertDeliveryPayload,
  beforeProviderSend?: (message: { to: string }) => Promise<void>,
) {
  const url = notificationUnsubscribeUrl(
    { userId: recipient.userId, projectId: recipient.projectId, stream: "alert" },
    resolveCanonicalOrigin(),
  );
  const content = notificationUnsubscribeFooter(
    {
      html: `<p><strong>${escapeHtml(payload.headline)}</strong></p><p>${escapeHtml(payload.action)}</p>`,
      text: `${payload.headline}\n\n${payload.action}`,
    },
    url,
  );
  await sendEmail({
    category: "bulk",
    beforeProviderSend,
    from: alertsEmailFrom(),
    ...content,
    subject: `[bisibility] ${payload.headline}`,
    to: recipient.email,
    listUnsubscribeUrl: url,
  });
}

function positionLabel(position: number | null) {
  return position ? `#${position}` : "No rank";
}

function slackMessageText(payload: TriggeredAlertDeliveryPayload) {
  return [
    payload.headline,
    `${payload.keyword} on ${payload.projectDomain}: ${positionLabel(payload.beforePosition)} to ${positionLabel(payload.afterPosition)}`,
    payload.action,
  ].join("\n");
}

function slackApiError(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const error = (payload as { error?: unknown }).error;
  return typeof error === "string" && error ? error : null;
}

export async function sendSlackMessage(
  connectionRef: { enabled: boolean; id: string },
  text: string,
) {
  if (!connectionRef.enabled) {
    return false;
  }

  const connection = await prisma.slackConnection.findUnique({
    select: { accessTokenHash: true, channelId: true, enabled: true },
    where: { id: connectionRef.id },
  });
  if (!connection?.enabled || !connection.channelId) {
    return false;
  }

  const response = await fetch(SLACK_POST_MESSAGE_ENDPOINT, {
    body: JSON.stringify({
      channel: connection.channelId,
      text,
      unfurl_links: false,
      unfurl_media: false,
    }),
    headers: {
      Authorization: `Bearer ${decryptSecret(connection.accessTokenHash)}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    method: "POST",
    signal: AbortSignal.timeout(DELIVERY_FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new DeliveryHttpError(
      `Slack alert send failed with status ${response.status}.`,
      response.status,
      parseRetryAfterSeconds(response.headers.get("Retry-After")),
    );
  }
  const responsePayload = await response.json().catch(() => null);
  if (responsePayload?.ok !== true) {
    const reason = slackApiError(responsePayload);
    throw new Error(reason ? `Slack alert send failed: ${reason}.` : "Slack alert send failed.");
  }

  return true;
}

export async function sendSlackAlert(
  connectionRef: { enabled: boolean; id: string },
  payload: TriggeredAlertDeliveryPayload,
) {
  return sendSlackMessage(connectionRef, slackMessageText(payload));
}

export async function stampWebhookDelivery(endpointId: string) {
  try {
    await prisma.webhookEndpoint.updateMany({
      data: { lastDeliveryAt: new Date() },
      where: { id: endpointId },
    });
  } catch (error) {
    console.error("Failed to stamp webhook delivery.", { endpointId, error });
  }
}

export async function recordDeliveryAttempt(
  alertId: string,
  channel: AlertDeliveryChannel,
  status: "failed" | "partial" | "sent" | "skipped" | "unknown",
  error: string | null,
  webhookEndpointId?: string,
  counts?: DeliveryCounts,
) {
  const data = {
    attemptedAt: new Date(),
    channel,
    error: error ? error.slice(0, MAX_DELIVERY_ERROR_LENGTH) : null,
    status,
    triggeredAlertId: alertId,
    ...counts,
    ...(webhookEndpointId ? { webhookEndpointId } : {}),
  } satisfies Prisma.DeliveryAttemptUncheckedCreateInput;

  try {
    await prisma.deliveryAttempt.create({ data });
  } catch (deliveryAttemptError) {
    if (
      !(deliveryAttemptError instanceof Prisma.PrismaClientKnownRequestError) ||
      deliveryAttemptError.code !== "P2003"
    ) {
      throw deliveryAttemptError;
    }
    const alert = await prisma.triggeredAlert.findUnique({
      where: { id: alertId },
      select: { id: true },
    });
    if (!alert) return;
    if (!webhookEndpointId) throw deliveryAttemptError;
    const { webhookEndpointId: _deletedEndpointId, ...fallbackData } = data;
    await prisma.deliveryAttempt.create({ data: fallbackData });
  }
}
