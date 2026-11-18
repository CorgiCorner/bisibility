import { type AssistantErrorView, assistantErrorSchema } from "@/lib/assistant/wire";

export class AssistantRequestError extends Error {
  constructor(public readonly detail: AssistantErrorView | null) {
    super(detail?.code ?? "network");
  }
}

export async function assistantFetch(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let detail: AssistantErrorView | null = null;
    try {
      const body: unknown = await response.json();
      const parsed = assistantErrorSchema.safeParse(body);
      if (parsed.success) detail = parsed.data;
      else if (typeof body === "object" && body !== null && "error" in body) {
        const nested = assistantErrorSchema.safeParse(body.error);
        if (nested.success) detail = nested.data;
      }
    } catch {
      /* Network and non-JSON errors have a separate retry state. */
    }
    throw new AssistantRequestError(detail);
  }
  return response;
}

export async function assistantGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  return (await assistantFetch(url, { signal })).json() as Promise<T>;
}
