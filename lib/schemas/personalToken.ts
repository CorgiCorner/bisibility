import { z } from "zod";
import { apiKeyScopeSchema } from "./apiKey";

const idSchema = z.string().trim().min(1).max(120);

// Shared by the settings UI server actions and the v1 API. Expiry is optional
// (null = never); the CLI defaults to 90 days on `auth login`.
export const issuePersonalTokenSchema = z.object({
  expiresInDays: z
    .union([z.literal(30), z.literal(90), z.literal(365)])
    .nullable()
    .default(null),
  name: z.string().trim().min(1).max(80),
  scope: apiKeyScopeSchema.default("read"),
});

export const revokePersonalTokenSchema = z.object({
  tokenId: idSchema,
});

export type IssuePersonalTokenInput = z.infer<typeof issuePersonalTokenSchema>;
export type RevokePersonalTokenInput = z.infer<typeof revokePersonalTokenSchema>;
