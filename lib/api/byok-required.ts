import type { OwnProviderKeyRequiredError } from "@/lib/providers/execution-extension-errors";
import type { ApiContext } from "./context";
import { errorResponse } from "./responses";

/**
 * The account runs paid provider work only on its own keys and none serves this request. Nothing
 * was dispatched or charged. Adding credits does not help; connecting the named provider does.
 */
export function ownProviderKeyRequiredResponse(
  error: OwnProviderKeyRequiredError,
  ctx: Pick<ApiContext, "headers" | "instance">,
): Response {
  const headers = new Headers(ctx.headers);
  headers.delete("Retry-After");
  headers.delete("RateLimit-Reset");
  return errorResponse("byok_required", error.message, 403, {
    headers,
    instance: ctx.instance,
    problemDetails: { capability: error.capability, provider: error.provider },
  });
}
