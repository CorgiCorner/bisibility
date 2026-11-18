import { ModelTransportError } from "./errors";
import { modelWorkspaceIdSchema } from "./routing-settings";
import type { ModelDeadline } from "./transport-deadline";
import { type ModelJsonOptions, parseModelJson } from "./transport-json";

export { parseModelJson as safeModelJson } from "./transport-json";
export type ModelResponseBudget = { remaining: number };

export type ModelTransportResponse = {
  body: unknown;
  requestId: string | null;
  resolvedWorkspaceId?: string | null;
};
export function safeModelWorkspaceId(response: Response, apiKey: string): string | null {
  const parsed = modelWorkspaceIdSchema.safeParse(response.headers.get("anthropic-workspace-id"));
  return parsed.success && !parsed.data.includes(apiKey) && !apiKey.includes(parsed.data)
    ? parsed.data
    : null;
}

export function safeModelRequestId(
  response: Response,
  apiKey: string,
  body?: string,
): string | null {
  const value = response.headers.get("x-request-id") ?? response.headers.get("request-id");
  return value &&
    /^req_[A-Za-z0-9]{8,96}$/.test(value) &&
    !value.includes(apiKey) &&
    !apiKey.includes(value) &&
    !body?.includes(value)
    ? value
    : null;
}

export function discardModelResponse(response: Response) {
  void response.body?.cancel().catch(() => {});
}

export async function readModelJson(
  response: Response,
  maxBytes: number,
  deadline: ModelDeadline,
  options?: ModelJsonOptions,
  budget?: ModelResponseBudget,
  onText?: (prefix: string) => void,
) {
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (
    !contentType ||
    !(contentType === "application/json" || /^application\/[a-z0-9.-]+\+json$/.test(contentType))
  ) {
    discardModelResponse(response);
    throw new ModelTransportError("invalid_response");
  }
  const length = response.headers.get("content-length");
  const encoding = response.headers.get("content-encoding")?.trim().toLowerCase();
  // Fetch decodes compressed bodies but retains their wire Content-Length.
  const identity = !encoding || encoding === "identity";
  if (length !== null && (!/^\d+$/.test(length) || (identity && Number(length) > maxBytes))) {
    discardModelResponse(response);
    throw new ModelTransportError("invalid_response");
  }
  if (!response.body) throw new ModelTransportError("invalid_response");
  const reader = response.body.getReader();
  try {
    let bytes = 0;
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let text = "";
    while (true) {
      const chunk = await deadline.run(() => reader.read());
      if (chunk.done) break;
      if (budget) {
        budget.remaining -= chunk.value.byteLength;
        if (budget.remaining < 0) throw new ModelTransportError("invalid_response");
      }
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new ModelTransportError("invalid_response");
      text += decoder.decode(chunk.value, { stream: true });
      onText?.(text);
    }
    text += decoder.decode();
    if (identity && length !== null && Number(length) !== bytes)
      throw new ModelTransportError("invalid_response");
    return parseModelJson(text, options);
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
