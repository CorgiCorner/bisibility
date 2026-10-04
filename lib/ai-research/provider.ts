import "server-only";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { ProviderCallError } from "@/lib/providers/call-error";
import { requireDataForSeoLogin } from "@/lib/providers/serp/dataforseo-client";
import type { DataForSeoResponse } from "@/lib/providers/serp/dataforseo-payload";
import { dataForSeoResponseCostCents } from "@/lib/providers/serp/dataforseo-payload";
import { dataForSeoUsageReceipt } from "@/lib/providers/serp/usage-receipts";
import type { ProviderCredentials } from "@/lib/providers/types";
import { readObservedResponse } from "@/lib/providers/usage";
import { z } from "zod";
import { AI_REQUEST_BUDGET_MS, aiDeadlineSignal } from "./deadline";
import { observedRow, promptRow } from "./normalize";
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
) {
  const signal = aiDeadlineSignal(deadlineAt, AI_REQUEST_BUDGET_MS);
  const observed = await readObservedResponse<DataForSeoResponse>({
    observer: credentials.usageObserver,
    requireMeasuredUsage: true,
    measure: dataForSeoUsageReceipt,
    request: () => {
      const authorization = requireDataForSeoLogin(credentials);
      onDispatch?.();
      return fetch(`${BASE}${path}`, {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([payload]),
        signal,
      });
    },
  });
  const data = observed.data;
  const task = data?.tasks?.[0];
  if (observed.response.status === 401) throw new ProviderAuthError("dataforseo");
  if (!observed.response.ok || data?.status_code !== 20000 || !task || task.status_code !== 20000)
    throw new ProviderCallError(
      "AI provider rejected the request.",
      data ? dataForSeoResponseCostCents(data) : null,
    );
  return {
    result: task.result?.[0],
    costCents: dataForSeoResponseCostCents(data),
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
  const response = await fetch(`${BASE}chat_gpt/llm_responses/models`, {
    headers: { Authorization: requireDataForSeoLogin(credentials) },
    signal: aiDeadlineSignal(deadlineAt, 10_000),
  });
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
    .parse(await response.json());
  if (!response.ok) throw new Error("Provider model capabilities are unavailable.");
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
  capabilities?: ReadonlySet<string>,
  onDispatch?: () => void,
) {
  const supported = capabilities ?? (await supportedPromptModels(credentials, deadlineAt));
  if (!supported.has(model))
    throw new ProviderCallError(
      "Selected model is unavailable or no longer supports bounded responses.",
      0,
    );
  const result = await aiProviderRequest(
    credentials,
    PROMPT_PATH,
    {
      user_prompt: input.prompt,
      model_name: model,
      max_output_tokens: 512,
      web_search: false,
      temperature: 0,
      tag,
    },
    deadlineAt,
    onDispatch,
  );
  try {
    return { ...result, row: promptRow(result.result, input) };
  } catch {
    throw new ProviderCallError("Prompt response could not be normalized.", result.costCents);
  }
}
