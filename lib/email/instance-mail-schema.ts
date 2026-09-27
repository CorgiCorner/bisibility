import { z } from "zod";

const ADDRESS =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isEmailSender(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 320 || /[\r\n]/.test(trimmed)) return false;
  const named = trimmed.match(/^(.*)<([^<>]+)>\s*$/);
  if (!named) return ADDRESS.test(trimmed);
  const name = named[1]?.trim().replace(/^"|"$/g, "").trim() ?? "";
  const address = named[2]?.trim() ?? "";
  return name.length > 0 && ADDRESS.test(address);
}

type InstanceMailSchemaMessages = {
  code: string;
  port: string;
  required: string;
  sender: string;
  sesPair: string;
};

const defaultMessages: InstanceMailSchemaMessages = {
  code: "Enter the 6-digit authenticator code.",
  port: "Enter a port from 1 to 65535.",
  required: "Enter a value.",
  sender: "Enter a sender as Name <address@example.com> or a plain address.",
  sesPair: "Enter both the access key ID and the secret access key, or leave both empty.",
};

type InstanceMailSchemaOptions = {
  credentialsRequired: boolean;
  messages?: Partial<InstanceMailSchemaMessages>;
  senderRequired: boolean;
};

function issue(context: z.RefinementCtx, path: string, message: string) {
  context.addIssue({ code: "custom", message, path: [path] });
}

export function instanceMailFormSchema({
  credentialsRequired,
  messages,
  senderRequired,
}: InstanceMailSchemaOptions) {
  const copy = { ...defaultMessages, ...messages };
  return z
    .object({
      code: z.string().trim().max(16),
      provider: z.enum(["resend", "ses", "smtp"]),
      replaceCredentials: z.boolean(),
      resendApiKey: z.string().max(200),
      sender: z.string().trim().max(320),
      sesAccessKeyId: z.string().trim().max(128),
      sesRegion: z.string().trim().max(32),
      sesSecretAccessKey: z.string().max(200),
      smtpHost: z.string().trim().max(255),
      smtpPassword: z.string().max(200),
      smtpPort: z.string().trim().max(5),
      smtpUsername: z.string().max(320),
    })
    .superRefine((value, context) => {
      if (!/^\d{6}$/.test(value.code)) issue(context, "code", copy.code);
      if (senderRequired || value.sender) {
        if (!isEmailSender(value.sender)) issue(context, "sender", copy.sender);
      }
      if (!credentialsRequired) return;
      if (value.provider === "resend") {
        if (!value.resendApiKey.trim() || /\s/.test(value.resendApiKey)) {
          issue(context, "resendApiKey", copy.required);
        }
        return;
      }
      if (value.provider === "ses") {
        if (!/^[a-z0-9-]+$/.test(value.sesRegion)) issue(context, "sesRegion", copy.required);
        const hasKey = value.sesAccessKeyId.length > 0;
        const hasSecret = value.sesSecretAccessKey.length > 0;
        if (hasKey !== hasSecret) issue(context, "sesAccessKeyId", copy.sesPair);
        return;
      }
      if (!value.smtpHost) issue(context, "smtpHost", copy.required);
      if (
        !/^\d+$/.test(value.smtpPort) ||
        Number(value.smtpPort) < 1 ||
        Number(value.smtpPort) > 65535
      ) {
        issue(context, "smtpPort", copy.port);
      }
      if (!value.smtpUsername.trim()) issue(context, "smtpUsername", copy.required);
      if (!value.smtpPassword) issue(context, "smtpPassword", copy.required);
    });
}

export type InstanceMailFormValues = z.infer<ReturnType<typeof instanceMailFormSchema>>;
