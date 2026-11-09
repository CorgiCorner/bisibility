import { captureHttpResponse } from "@/lib/providers/provider-response";
import type { ProviderCredentials } from "@/lib/providers/types";
import { dataForSeoAuthorization } from "./dataforseo-queued-authorization";
import type { RedirectMapping, RedirectTransport } from "./redirect-resolution";

const CONVERTER_URL = "https://api.dataforseo.com/v3/appendix/goto_url_converter";

export function dataForSeoRedirectTransport(
  credentials: ProviderCredentials,
  timeoutMs: number,
  signal?: AbortSignal,
): RedirectTransport {
  return async (urls) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const response = await fetch(CONVERTER_URL, {
      method: "POST",
      headers: {
        Authorization: dataForSeoAuthorization(credentials),
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{ goto_urls: urls }]),
      redirect: "error",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    await captureHttpResponse(response, credentials.captureResponse, CONVERTER_URL);
    if (!response.ok) throw new Error("Redirect conversion failed.");
    const data = (await response.json()) as {
      status_code?: number;
      tasks?: Array<{ status_code?: number; result?: RedirectMapping[] }>;
    };
    const task = data.tasks?.[0];
    if (
      data.status_code !== 20000 ||
      data.tasks?.length !== 1 ||
      task?.status_code !== 20000 ||
      !Array.isArray(task.result)
    ) {
      throw new Error("Redirect conversion returned an invalid response.");
    }
    return task.result;
  };
}
