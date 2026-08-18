import { recordResendSend } from "@/lib/email/send-counter";
import { type EmailMessage, type EmailProvider, EmailSendError } from "@/lib/email/types";
import { parseRetryAfterSeconds } from "@/lib/http/retry-after";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 10_000;

async function send({
  from,
  to,
  subject,
  html,
  replyTo,
  text,
  sendCounterReserved = false,
}: EmailMessage) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required to send email.");
  }

  await recordResendSend(sendCounterReserved);
  const response = await fetch(RESEND_ENDPOINT, {
    body: JSON.stringify({
      from,
      html,
      ...(replyTo ? { reply_to: [replyTo] } : {}),
      subject,
      text,
      to: [to],
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new EmailSendError(
      `Resend send failed with status ${response.status}.`,
      response.status,
      parseRetryAfterSeconds(response.headers.get("Retry-After")),
    );
  }
}

export const resendEmailProvider: EmailProvider = {
  id: "resend",
  isConfigured: () => Boolean(process.env.RESEND_API_KEY),
  label: "Resend",
  send,
};
