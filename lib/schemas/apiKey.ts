import { z } from "zod";

const idSchema = z.string().trim().min(1).max(120);
export const apiKeyScopeSchema = z.enum(["admin", "read", "write"]);

export const issueApiKeySchema = z.object({
  expiresInDays: z.union([z.literal(30), z.literal(90), z.null()]).default(90),
  name: z.string().trim().min(1).max(80),
  projectId: idSchema,
  scope: apiKeyScopeSchema.default("admin"),
});

export const revokeApiKeySchema = z.object({
  apiKeyId: idSchema,
  projectId: idSchema,
});

export const regenerateApiKeySchema = revokeApiKeySchema;

export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;
export type IssueApiKeyInput = z.infer<typeof issueApiKeySchema>;
export type RegenerateApiKeyInput = z.infer<typeof regenerateApiKeySchema>;
export type RevokeApiKeyInput = z.infer<typeof revokeApiKeySchema>;
