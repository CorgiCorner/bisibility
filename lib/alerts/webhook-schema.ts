import "server-only";

import { z } from "zod";
import { emptyToNull, idSchema } from "./schema";
import { hasBlockedLiteralWebhookTarget, PRIVATE_NETWORK_WEBHOOK_ERROR } from "./webhook-target";

export const webhookUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    if (!URL.canParse(value)) {
      return false;
    }
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  }, "Enter a valid HTTP or HTTPS webhook URL.")
  .refine((value) => !hasBlockedLiteralWebhookTarget(value), PRIVATE_NETWORK_WEBHOOK_ERROR);

export const webhookHmacSecretSchema = z.string().trim().min(16).max(500);

export const webhookEndpointSchema = z.object({
  description: z.preprocess(emptyToNull, z.string().trim().max(160).nullable().optional()),
  enabled: z.coerce.boolean().default(true),
  endpointId: idSchema.optional(),
  hmacSecret: z.preprocess(emptyToNull, webhookHmacSecretSchema.nullable().optional()),
  projectId: idSchema,
  url: webhookUrlSchema,
});

export const webhookEndpointMemberSchema = z.object({
  endpointId: idSchema,
  projectId: idSchema,
});

export type WebhookEndpointInput = z.infer<typeof webhookEndpointSchema>;
