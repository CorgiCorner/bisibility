import "server-only";

import { prisma } from "@/lib/db/prisma";
import { readDemoConfig, readOnlyDemoConfig } from "@/lib/demo/config";
import { notifyOps } from "@/lib/ops/notify";
import { reserveEmailDailyBudget } from "./budget";
import { requireEmailFrom } from "./from";
import { refreshInstanceMailRuntime } from "./instance-mail-store";
import { assertMailNotSuppressed, recordMailReceipt } from "./provider-feedback-store";
import { resolveEmailProvider } from "./registry";
import {
  EmailBudgetExceededError,
  type EmailCategory,
  EmailNotSubmittedError,
  EmailProviderUnavailableError,
  EmailSendError,
  EmailSuppressedError,
  SUPPORTED_EMAIL_PROVIDERS,
} from "./types";

const SUBJECT_PREFIX = "[bisibility] ";

export { EmailBudgetExceededError, EmailSendError } from "./types";

export type SendEmailInput = {
  category: EmailCategory;
  beforeProviderSend?: (message: { to: string }) => Promise<void>;
  claimProviderSend?: () => Promise<void>;
  dailyBudgetReserved?: boolean;
  from?: string;
  headers?: Record<string, string>;
  html: string;
  idempotencyKey?: string;
  listUnsubscribeUrl?: string;
  replyTo?: string;
  requireProvider?: boolean;
  sendCounterReserved?: boolean;
  subject: string;
  text: string;
  to: string;
};

function devLogSubject(subject: string) {
  return subject.startsWith(SUBJECT_PREFIX) ? subject.slice(SUBJECT_PREFIX.length) : subject;
}

async function prepareEmail({
  category,
  dailyBudgetReserved = false,
  from,
  headers: suppliedHeaders,
  to,
  subject,
  html,
  idempotencyKey,
  listUnsubscribeUrl,
  replyTo,
  text,
  sendCounterReserved = false,
  requireProvider = false,
}: SendEmailInput) {
  try {
    let headers = suppliedHeaders;
    if (listUnsubscribeUrl !== undefined) {
      const url = new URL(listUnsubscribeUrl);
      if (
        category !== "bulk" ||
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        /[\s<>]/.test(listUnsubscribeUrl)
      )
        throw new Error("Invalid list unsubscribe URL.");
      headers ??= {
        "List-Unsubscribe": `<${listUnsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      };
    }
    if (readOnlyDemoConfig()) throw new Error("Email delivery is disabled in the demo.");
    const demo = readDemoConfig();
    if (demo.kind !== "disabled") {
      const viewer = await prisma.user.findUnique({
        where: { publicId: demo.viewerPublicId },
        select: { email: true },
      });
      if (!viewer) {
        // A missing row must not silence the Owner; the address match below is the Viewer fence.
        console.error(
          "[email] configured demo viewer row is missing; viewer mail fence is inactive.",
        );
      } else if (viewer.email.toLowerCase() === to.toLowerCase()) {
        throw new Error("Demo viewer is not eligible for email.");
      }
    }
    await refreshInstanceMailRuntime();
    const provider = resolveEmailProvider();

    if (!provider) {
      if (requireProvider)
        throw new EmailProviderUnavailableError("Email provider is unavailable.");
      if (process.env.NODE_ENV === "production") {
        throw new Error(`Configure EMAIL_PROVIDER (${SUPPORTED_EMAIL_PROVIDERS}) to send email.`);
      }
      console.info(`[email] ${devLogSubject(subject)} for ${to}`);
      return;
    }

    if (requireProvider && !provider.isConfigured())
      throw new EmailProviderUnavailableError("Email provider is not configured.");

    const message = {
      from: from ?? requireEmailFrom(),
      html,
      ...(headers ? { headers } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
      replyTo,
      sendCounterReserved,
      subject,
      text,
      to,
    };
    if (!provider.isConfigured()) {
      return { provider, message };
    }

    if (category === "bulk") await assertMailNotSuppressed(to);
    if (dailyBudgetReserved) return { provider, message };

    const reservation = await reserveEmailDailyBudget(category);
    if (!reservation.granted) {
      if (reservation.notificationDue) {
        const utcDate = reservation.day.toISOString().slice(0, 10);
        await notifyOps({
          dedupeKey: `email-budget:${category}:${utcDate}`,
          fields: {
            Category: category,
            "Daily recipient limit": reservation.limit,
            "UTC day": utcDate,
          },
          kind: "email_daily_budget_exhausted",
          severity: "error",
          title: `Daily ${category} email budget exhausted`,
        });
      }
      throw new EmailBudgetExceededError(category, reservation.limit, reservation.day);
    }

    return { provider, message };
  } catch (error) {
    if (error instanceof EmailBudgetExceededError || error instanceof EmailSuppressedError)
      throw error;
    throw new EmailNotSubmittedError(error);
  }
}

export async function sendEmail(input: SendEmailInput) {
  const prepared = await prepareEmail(input);
  if (!prepared) {
    await input.claimProviderSend?.();
    return;
  }
  await input.beforeProviderSend?.(prepared.message);
  if (input.category === "bulk") await assertMailNotSuppressed(prepared.message.to);
  await input.claimProviderSend?.();
  const receipt = await prepared.provider.send(prepared.message);
  if (receipt) {
    try {
      if (!receipt.messageId) throw new Error("Provider message ID missing.");
      await recordMailReceipt({
        provider: prepared.provider.id,
        messageId: receipt.messageId,
        recipient: prepared.message.to,
      });
    } catch {
      throw new EmailSendError(
        "Provider accepted the message but its receipt could not be stored.",
        500,
        null,
        { ambiguous: true },
      );
    }
  }
}
