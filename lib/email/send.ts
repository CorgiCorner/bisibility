import "server-only";

import { readOnlyDemoConfig } from "@/lib/demo/config";
import { notifyOps } from "@/lib/ops/notify";
import { reserveEmailDailyBudget } from "./budget";
import { requireEmailFrom } from "./from";
import { refreshInstanceMailRuntime } from "./instance-mail-store";
import { resolveEmailProvider } from "./registry";
import {
  EmailBudgetExceededError,
  type EmailCategory,
  EmailNotSubmittedError,
  EmailProviderUnavailableError,
  SUPPORTED_EMAIL_PROVIDERS,
} from "./types";

const SUBJECT_PREFIX = "[bisibility] ";

export { EmailBudgetExceededError, EmailSendError } from "./types";

export type SendEmailInput = {
  category: EmailCategory;
  from?: string;
  requireProvider?: boolean;
  html: string;
  listUnsubscribeUrl?: string;
  replyTo?: string;
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
  from,
  to,
  subject,
  html,
  listUnsubscribeUrl,
  replyTo,
  text,
  sendCounterReserved = false,
  requireProvider = false,
}: SendEmailInput) {
  try {
    let headers: Record<string, string> | undefined;
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
      headers = {
        "List-Unsubscribe": `<${listUnsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      };
    }
    if (readOnlyDemoConfig()) throw new Error("Email delivery is disabled in the demo.");
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
      replyTo,
      sendCounterReserved,
      subject,
      text,
      to,
    };
    if (!provider.isConfigured()) {
      return { provider, message };
    }

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
    if (error instanceof EmailBudgetExceededError) throw error;
    throw new EmailNotSubmittedError(error);
  }
}

export async function sendEmail(input: SendEmailInput) {
  const prepared = await prepareEmail(input);
  if (prepared) await prepared.provider.send(prepared.message);
}
