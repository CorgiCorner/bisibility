import { isPublicIdOfType } from "@/lib/db/public-id";
import { z } from "zod";

export const modelPlatformConnectionSchema = z.enum([
  "platform:openai",
  "platform:anthropic",
  "platform:openrouter",
]);
export const modelConnectionIdSchema = z.union([
  z.string().refine((value) => isPublicIdOfType(value, "conn")),
  modelPlatformConnectionSchema,
]);

/** These are requested source identifiers, not authorization or provider credentials. */
export function validateModelFundingInput(
  column: {
    connectionId: string;
    providerId: string;
    payment: { fundingSource: "byok" | "platform"; optionId: string };
    settings: { workspaceId?: string };
  },
  ctx: z.RefinementCtx,
) {
  const platform = column.connectionId.startsWith("platform:");
  if (
    platform !== (column.payment.fundingSource === "platform") ||
    (platform &&
      (column.connectionId !== `platform:${column.providerId}` ||
        column.payment.optionId !== column.connectionId ||
        column.settings.workspaceId !== undefined))
  )
    ctx.addIssue({
      code: "custom",
      path: ["payment"],
      message: "Funding does not match the provider connection.",
    });
}
