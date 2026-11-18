import { modelWorkspaceIdSchema } from "@/lib/providers/model/routing-settings";
import type { ModelCatalogSnapshot } from "@/lib/providers/model/types";
import { z } from "zod";
import { modelColumnSchema } from "./schema";

/** Free column metadata load. Resolve the project-owned connection on the server. */
export const modelPlaygroundCatalogRequestSchema = z
  .object({
    providerId: modelColumnSchema.shape.providerId,
    connectionId: modelColumnSchema.shape.connectionId,
    workspaceId: modelWorkspaceIdSchema.optional(),
  })
  .strict()
  .refine((value) => value.workspaceId === undefined || value.providerId === "anthropic", {
    path: ["workspaceId"],
    message: "Workspace ID is only available for Anthropic columns.",
  })
  .refine(
    (value) =>
      !value.connectionId.startsWith("platform:") ||
      (value.connectionId === `platform:${value.providerId}` && value.workspaceId === undefined),
    "Platform catalog scope does not match the provider.",
  );
export type ModelPlaygroundCatalogRequest = z.infer<typeof modelPlaygroundCatalogRequestSchema>;

/** P12 must carry workspaceId to probe and the account/credential-revision cache scope.
 * Return the exact requested scope; never reuse another workspace or an unscoped catalog.
 * AbortSignal is client-only; authenticated actions must validate the request again. */
export type ModelPlaygroundCatalogLoader = (
  request: ModelPlaygroundCatalogRequest,
  signal: AbortSignal,
) => Promise<ModelCatalogSnapshot>;

export function columnCatalogRequest(
  column: import("./types").ModelColumn,
): ModelPlaygroundCatalogRequest {
  return {
    providerId: column.providerId,
    connectionId: column.connectionId,
    ...(column.settings.workspaceId ? { workspaceId: column.settings.workspaceId } : {}),
  };
}
