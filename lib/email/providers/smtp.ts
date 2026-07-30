import { type EmailMessage, type EmailProvider, EmailSendError } from "@/lib/email/types";
import { createTransport } from "nodemailer";

const SMTP_TIMEOUT_MS = 10_000;
const SMTP_TRANSPORT_OPTIONS = {
  connectionTimeout: SMTP_TIMEOUT_MS,
  pool: false,
  socketTimeout: SMTP_TIMEOUT_MS,
};

// Environment reads stay literal so deployment wiring checks can find them.
function configuredValue(value: string | undefined) {
  return value?.trim() || null;
}

type SmtpError = {
  responseCode?: number;
  retryAfterSeconds?: number;
};

function toEmailSendError(error: unknown) {
  const smtpError = error as SmtpError;
  const status = smtpError?.responseCode ?? 500;
  const retryAfterSeconds =
    typeof smtpError?.retryAfterSeconds === "number" ? smtpError.retryAfterSeconds : null;
  return new EmailSendError(
    `SMTP transport send failed with status ${status}.`,
    status,
    retryAfterSeconds,
  );
}

async function send({ from, to, subject, html, text }: EmailMessage) {
  const url = configuredValue(process.env.SMTP_URL);
  if (!url) {
    throw new Error("SMTP_URL is required to send email with SMTP.");
  }

  try {
    const transport = createTransport(url, SMTP_TRANSPORT_OPTIONS);
    try {
      await transport.sendMail({ from, html, subject, text, to });
    } finally {
      transport.close();
    }
  } catch (error) {
    throw toEmailSendError(error);
  }
}

export const smtpEmailProvider: EmailProvider = {
  id: "smtp",
  isConfigured: () => configuredValue(process.env.SMTP_URL) !== null,
  label: "SMTP",
  send,
};
