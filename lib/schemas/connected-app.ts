import { z } from "zod";

export const revokeConnectedAppSchema = z.object({
  clientId: z.string().trim().min(1).max(512),
  revokeCreatedTokens: z.boolean(),
});
export type RevokeConnectedAppOptions = Pick<
  z.infer<typeof revokeConnectedAppSchema>,
  "revokeCreatedTokens"
>;
export type AppCreatedToken = { id: string; name: string };
export type ConnectedApp = {
  clientId: string;
  name: string;
  dynamic: boolean;
  scopes: string[];
  connectedAt: string;
  lastUsedAt: string | null;
  createdTokens: AppCreatedToken[];
};
