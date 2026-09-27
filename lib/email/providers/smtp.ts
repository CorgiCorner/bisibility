import { storedMailProvider } from "@/lib/email/instance-mail-runtime";
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

async function send({ from, to, subject, html, replyTo, text }: EmailMessage) {
  const url = configuredValue(process.env.SMTP_URL);
  const stored = storedMailProvider("smtp");
  if (!url && !stored?.smtpHost) {
    throw new Error("SMTP_URL is required to send email with SMTP.");
  }

  try {
    const transport = url
      ? createTransport(url, SMTP_TRANSPORT_OPTIONS)
      : createTransport({
          auth: { pass: stored?.smtpPassword ?? "", user: stored?.smtpUsername ?? "" },
          host: stored?.smtpHost ?? "",
          port: stored?.smtpPort ?? 587,
          secure: stored?.smtpPort === 465,
          ...SMTP_TRANSPORT_OPTIONS,
        });
    try {
      await transport.sendMail({ from, html, replyTo, subject, text, to });
    } finally {
      transport.close();
    }
  } catch (error) {
    throw toEmailSendError(error);
  }
}

export const smtpEmailProvider: EmailProvider = {
  id: "smtp",
  isConfigured: () =>
    configuredValue(process.env.SMTP_URL) !== null || Boolean(storedMailProvider("smtp")?.smtpHost),
  label: "SMTP",
  send,
};
