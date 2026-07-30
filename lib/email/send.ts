import "server-only";

import { notifyOps } from "@/lib/ops/notify";
import { reserveEmailDailyBudget } from "./budget";
import { requireEmailFrom } from "./from";
import { resolveEmailProvider } from "./registry";
import { EmailBudgetExceededError, type EmailCategory, SUPPORTED_EMAIL_PROVIDERS } from "./types";

const SUBJECT_PREFIX = "[Bisibility] ";

export { EmailBudgetExceededError, EmailSendError } from "./types";

export type SendEmailInput = {
  category: EmailCategory;
  from?: string;
  html: string;
  sendCounterReserved?: boolean;
  subject: string;
  text: string;
  to: string;
};

function devLogSubject(subject: string) {
  return subject.startsWith(SUBJECT_PREFIX) ? subject.slice(SUBJECT_PREFIX.length) : subject;
}

export async function sendEmail({
  category,
  from,
  to,
  subject,
  html,
  text,
  sendCounterReserved = false,
}: SendEmailInput) {
  const provider = resolveEmailProvider();

  if (!provider) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Configure EMAIL_PROVIDER (${SUPPORTED_EMAIL_PROVIDERS}) to send email.`);
    }
    console.info(`[email] ${devLogSubject(subject)} for ${to}`);
    return;
  }

  const message = {
    from: from ?? requireEmailFrom(),
    html,
    sendCounterReserved,
    subject,
    text,
    to,
  };
  if (!provider.isConfigured()) {
    await provider.send(message);
    return;
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

  await provider.send(message);
}
