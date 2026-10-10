import "server-only";
import { readBodyWithLimit } from "@/lib/http/bounded-body";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { ProviderCallError } from "@/lib/providers/call-error";
import {
  assertLiveResponseCapacity,
  reserveLiveResponseCapacity,
} from "@/lib/providers/live-capacity";
import { consumeProviderLimit } from "@/lib/providers/rate-limit";
import { requireDataForSeoLogin } from "@/lib/providers/serp/dataforseo-client";
import type { DataForSeoResponse } from "@/lib/providers/serp/dataforseo-payload";
import type { ProviderCredentials } from "@/lib/providers/types";
import { readObservedResponse } from "@/lib/providers/usage";
import { z } from "zod";
import { fetchAiResearchCapabilities } from "./catalog";
import type { AiModelCapability } from "./catalog-types";
import {
  AI_REQUEST_BUDGET_MS,
  AiDeadlineError,
  aiDeadlineSignal,
  assertAiDeadline,
} from "./deadline";
import { isLegacyModel, isLegacyPrompt } from "./legacy";
import { observedRow, promptRow } from "./normalize";
import { aiUsageReceipt } from "./provider-receipt";
import type { PromptInput, VisibilityInput } from "./schema";

const BASE = "https://api.dataforseo.com/v3/ai_optimization/";
export const VISIBILITY_PATH = "llm_mentions/search_mentions/live";
export const PROMPT_PATH = "chat_gpt/llm_responses/live";
export async function aiProviderRequest(
  credentials: ProviderCredentials,
  path: string,
  payload: Record<string, unknown>,
  deadlineAt = Date.now() + AI_REQUEST_BUDGET_MS,
  onDispatch?: () => void,
  projectId?: string,
) {
  const signal = aiDeadlineSignal(deadlineAt, 120_000);
  const authorization = requireDataForSeoLogin(credentials);
  const reservation = path.endsWith("/llm_responses/live")
    ? await reserveLiveResponseCapacity(credentials, projectId)
    : undefined;
  const observed = await readObservedResponse<DataForSeoResponse>({
    observer: credentials.usageObserver,
    requireMeasuredUsage: true,
    measure: aiUsageReceipt,
    beforeRequest: () => {
      assertAiDeadline(deadlineAt);
      if (signal.aborted) throw new AiDeadlineError();
      if (reservation) assertLiveResponseCapacity(reservation);
    },
    request: async () => {
      onDispatch?.();
      const response = await fetch(`${BASE}${path}`, {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([payload]),
        signal,
      });
      const body = await readBodyWithLimit(response, 2 * 1024 * 1024);
      if (!body.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error("The provider response is unreadable or exceeds its bounded size.");
      }
      return new Response(new Uint8Array(body.bytes), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    },
  });
  const data = observed.data;
  const task = data?.tasks?.[0];
  if (observed.response.status === 401) throw new ProviderAuthError("dataforseo");
  if (!observed.response.ok || data?.status_code !== 20000 || !task || task.status_code !== 20000)
    throw new ProviderCallError(
      "AI provider rejected the request.",
      aiUsageReceipt(data, observed.response).costCents,
    );
  return {
    result: task.result?.[0],
    costCents: aiUsageReceipt(data, observed.response).costCents!,
    providerRequestId: task.id,
  };
}
export async function fetchObserved(
  credentials: ProviderCredentials,
  input: VisibilityInput,
  tag: string,
  deadlineAt = Date.now() + AI_REQUEST_BUDGET_MS,
  onDispatch?: () => void,
) {
  const target =
    input.target_type === "domain"
      ? {
          domain: input.domain,
          search_filter: "include",
          search_scope: ["sources"],
          include_subdomains: true,
        }
      : {
          keyword: input.brand,
          search_filter: "include",
          search_scope: ["answer"],
          match_type: "word_match",
        };
  const result = await aiProviderRequest(
    credentials,
    VISIBILITY_PATH,
    {
      target: [target],
      platform: input.platform,
      location_code: input.location_code,
      language_code: input.language_code,
      limit: input.limit,
      tag,
    },
    deadlineAt,
    onDispatch,
  );
  if (!result.result || !Array.isArray(result.result.items))
    throw new ProviderCallError("AI visibility response is incomplete.", result.costCents);
  try {
    return {
      ...result,
      rows: result.result.items.slice(0, input.limit).map((row) => observedRow(row, input)),
      totalAvailable: result.result.total_count ?? null,
    };
  } catch {
    throw new ProviderCallError(
      "AI visibility response could not be normalized.",
      result.costCents,
    );
  }
}
export async function supportedPromptModels(
  credentials: ProviderCredentials,
  deadlineAt = Date.now() + AI_REQUEST_BUDGET_MS,
) {
  const limit = await consumeProviderLimit("dataforseo", credentials);
  if (!limit.success)
    throw new ProviderCallError("Provider model capabilities are rate limited.", 0);
  const response = await fetch(`${BASE}chat_gpt/llm_responses/models`, {
    headers: { Authorization: requireDataForSeoLogin(credentials) },
    signal: aiDeadlineSignal(deadlineAt, 10_000),
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new ProviderCallError("Provider model capabilities are unavailable.", 0);
  }
  const body = await readBodyWithLimit(response, 2 * 1024 * 1024);
  if (!body.ok)
    throw new ProviderCallError("Provider model capabilities are unreadable or too large.", 0);
  const envelope = z
    .object({
      status_code: z.literal(20000),
      tasks: z.array(
        z.object({
          status_code: z.literal(20000),
          result: z.array(
            z.object({ model_name: z.string(), reasoning: z.boolean() }).passthrough(),
          ),
        }),
      ),
    })
    .parse(JSON.parse(body.bytes.toString("utf8")));
  return new Set(
    envelope.tasks.flatMap((task) =>
      task.result.filter((model) => !model.reasoning).map((model) => model.model_name),
    ),
  );
}
export async function fetchPrompt(
  credentials: ProviderCredentials,
  input: PromptInput,
  model: string,
  tag: string,
  deadlineAt = Date.now() + AI_REQUEST_BUDGET_MS,
  capabilities?: ReadonlyMap<string, AiModelCapability> | ReadonlySet<string>,
  onDispatch?: () => void,
) {
  const legacy = isLegacyPrompt(input);
  const supported =
    capabilities ??
    (legacy
      ? await supportedPromptModels(credentials, deadlineAt)
      : new Map(
          (await fetchAiResearchCapabilities(credentials, deadlineAt)).catalog.models.map(
            (entry) => [entry.id, entry],
          ),
        ));
  const capability = "get" in supported ? supported.get(model) : undefined;
  if (
    !("get" in supported ? capability : supported.has(model)) ||
    (legacy && (!isLegacyModel(model) || capability?.reasoning))
  )
    throw new ProviderCallError(
      "Selected model is unavailable or no longer supports bounded responses.",
      0,
    );
  if (
    (!legacy && !capability) ||
    (capability &&
      (input.max_output_tokens < capability.minOutputTokens ||
        input.max_output_tokens > capability.maxOutputTokens ||
        (input.web_search && !capability.webSearch)))
  )
    throw new ProviderCallError("Selected model options are unsupported.", 0);
  const result = await aiProviderRequest(
    credentials,
    PROMPT_PATH,
    {
      user_prompt: input.prompt,
      model_name: model,
      ...(legacy
        ? { max_output_tokens: 512, web_search: false, temperature: 0 }
        : {
            max_output_tokens: input.max_output_tokens,
            web_search: input.web_search,
            ...(capability?.reasoning ? {} : { temperature: 0 }),
            ...(input.country_iso_code
              ? { web_search_country_iso_code: input.country_iso_code }
              : {}),
            system_message: `Respond in language ${input.response_language}. This is a response instruction, not a dataset filter.`,
          }),
      tag,
    },
    deadlineAt,
    onDispatch,
  );
  try {
    return { ...result, row: promptRow(result.result, input, model) };
  } catch {
    throw new ProviderCallError("Prompt response could not be normalized.", result.costCents);
  }
}
