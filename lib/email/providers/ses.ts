import { type EmailMessage, type EmailProvider, EmailSendError } from "@/lib/email/types";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const SES_TIMEOUT_MS = 10_000;

// Retry ownership stays with callers (Temporal activities classify EmailSendError);
// a second retry layer inside the SDK would stretch the latency budget.
const SES_MAX_ATTEMPTS = 1;

const clientsByRegion = new Map<string, SESv2Client>();

// Environment reads stay literal so the environment-wiring test can assert them.
function configuredValue(value: string | undefined) {
  return value?.trim() || null;
}

export function resolveSesRegion() {
  return (
    configuredValue(process.env.SES_REGION) ??
    configuredValue(process.env.AWS_REGION) ??
    configuredValue(process.env.AWS_DEFAULT_REGION)
  );
}

export function sesClientFor(region: string) {
  const existing = clientsByRegion.get(region);
  if (existing) {
    return existing;
  }

  const client = new SESv2Client({
    maxAttempts: SES_MAX_ATTEMPTS,
    region,
    requestHandler: { requestTimeout: SES_TIMEOUT_MS },
  });
  clientsByRegion.set(region, client);
  return client;
}

function toEmailSendError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  const metadataStatus = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
    ?.httpStatusCode;
  const status = name === "TooManyRequestsException" ? 429 : (metadataStatus ?? 500);
  const detail = name && name !== "Error" ? ` (${name})` : "";
  return new EmailSendError(`SES send failed with status ${status}${detail}.`, status, null);
}

async function send({ from, to, subject, html, text }: EmailMessage) {
  const region = resolveSesRegion();
  if (!region) {
    throw new Error("SES_REGION or AWS_REGION is required to send email with SES.");
  }

  const command = new SendEmailCommand({
    ConfigurationSetName: process.env.SES_CONFIGURATION_SET?.trim() || undefined,
    Content: {
      Simple: {
        Body: {
          Html: { Charset: "UTF-8", Data: html },
          Text: { Charset: "UTF-8", Data: text },
        },
        Subject: { Charset: "UTF-8", Data: subject },
      },
    },
    Destination: { ToAddresses: [to] },
    FromEmailAddress: from,
  });

  try {
    await sesClientFor(region).send(command);
  } catch (error) {
    throw toEmailSendError(error);
  }
}

export const sesEmailProvider: EmailProvider = {
  id: "ses",
  isConfigured: () => resolveSesRegion() !== null,
  label: "Amazon SES",
  send,
};
