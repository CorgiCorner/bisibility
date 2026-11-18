import "server-only";
import { createHmac } from "node:crypto";
import { getPurposeSecretKeys } from "@/lib/providers/crypto";
import { ModelTransportError } from "./errors";
import { modelWorkspaceIdSchema } from "./routing-settings";
import type { NativeModelProviderId } from "./types";

/** Keys and workspace selectors never enter a reusable account identifier in clear text. */
export function modelAccountDigest(
  providerId: NativeModelProviderId,
  apiKey: string,
  workspaceId?: string,
) {
  if (
    workspaceId !== undefined &&
    (providerId !== "anthropic" || !modelWorkspaceIdSchema.safeParse(workspaceId).success)
  )
    throw new ModelTransportError("invalid_request");
  return createHmac("sha256", getPurposeSecretKeys("bisibility:model-provider:account:v1")[0])
    .update(
      JSON.stringify(
        workspaceId === undefined ? [providerId, apiKey] : [providerId, apiKey, workspaceId],
      ),
    )
    .digest("hex");
}
