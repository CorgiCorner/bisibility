import "server-only";

import { type DateFormat, formatDate } from "@/lib/dates/format";
import { escapeHtml } from "@/lib/email/escape-html";
import { resolveFounderEmailIdentity } from "@/lib/email/founder-email-identity";
import { sendEmail } from "@/lib/email/send";

export const EMAIL_CHANGED_NOTICE_SUBJECT = "Your bisibility email address was changed";

export type EmailChangedNoticeInput = {
  changedAt: Date;
  dateFormat?: DateFormat;
  newEmail: string;
  previousEmail: string;
};

function changedAtLabel(changedAt: Date, dateFormat: DateFormat) {
  return formatDate(changedAt.toISOString().slice(0, 10), dateFormat);
}

export function emailChangedNotice(input: EmailChangedNoticeInput) {
  const changedAt = changedAtLabel(input.changedAt, input.dateFormat ?? "day_first");
  const text =
    `The email address on your bisibility account was changed to ${input.newEmail} on ${changedAt}. ` +
    "If you did not do this, reply to this email right away.";
  const html =
    `<p>The email address on your bisibility account was changed to <strong>${escapeHtml(input.newEmail)}</strong> on ${escapeHtml(changedAt)}.</p>` +
    "<p>If you did not do this, reply to this email right away.</p>";

  return { html, subject: EMAIL_CHANGED_NOTICE_SUBJECT, text };
}

/** Tells the address that lost the account, so a silent takeover cannot pass unnoticed. */
export async function sendEmailChangedNotice(input: EmailChangedNoticeInput) {
  const { html, subject, text } = emailChangedNotice(input);
  const { from, replyTo } = resolveFounderEmailIdentity();

  await sendEmail({
    category: "transactional",
    from,
    html,
    replyTo,
    subject,
    text,
    to: input.previousEmail,
  });
}
