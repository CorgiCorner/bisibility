import type { SamplePlan, SourceConfiguration, TrackingEngine } from "@/lib/ai-tracking/contract";
import { readBodyWithLimit } from "@/lib/http/bounded-body";
import { requireDataForSeoLogin } from "@/lib/providers/serp/dataforseo-client";
import type { ProviderCredentials } from "@/lib/providers/types";
import { z } from "zod";
import { assertTrackingDeadline } from "./dispatch-error";
import { array, object, type TrackingEnvelope } from "./envelope";
import { admitTrackingRequest } from "./request-admission";

export const TRACKING_CAPABILITY_VERSION = "2026-10-08-v1";
const modelParameters = z
  .object({
    max_output_tokens: z.number().int().min(16).max(4096),
    web_search: z.boolean().optional(),
    temperature: z.number().finite().min(0).max(2).optional(),
    cost_policy: z.literal("provider_actual_cost").optional(),
    actual_cost_acknowledgement: z.literal("non_guaranteed_estimate_v1").optional(),
    estimated_cost_limit_cents: z.number().finite().positive().optional(),
  })
  .strict();
const scrapeParameters = z
  .object({
    language_code: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,4})?$/),
    location_code: z.number().int().positive().optional(),
    location_name: z.string().trim().min(1).max(150).optional(),
    force_web_search: z.boolean().optional(),
    load_async_ai_overview: z.boolean().optional(),
    device: z.enum(["desktop", "mobile"]).optional(),
    os: z.enum(["windows", "macos", "android", "ios"]).optional(),
  })
  .strict();
export function canonicalTrackingEndpoint(
  source: SourceConfiguration["source"],
  engine: TrackingEngine,
  queued = true,
) {
  if (source === "google_aio" && engine === "google")
    return queued ? "serp/google/organic/task_post" : "serp/google/organic/live/advanced";
  if (source === "consumer_scrape" && ["chat_gpt", "gemini"].includes(engine))
    return `ai_optimization/${engine}/llm_scraper/${queued ? "task_post" : "live/advanced"}`;
  if (source === "model_api" && ["chat_gpt", "gemini", "claude"].includes(engine))
    return `ai_optimization/${engine}/llm_responses/${queued ? "task_post" : "live"}`;
  throw new Error("Tracking source and engine combination is unsupported.");
}
export function validateTrackingRequest(
  plan: Pick<
    SamplePlan,
    "source" | "engine" | "endpoint" | "promptText" | "requestedModel" | "requestedParameters"
  >,
) {
  if (
    plan.endpoint !==
    canonicalTrackingEndpoint(plan.source, plan.engine, plan.endpoint.endsWith("task_post"))
  )
    throw new Error("Tracking endpoint does not match the source capability.");
  const maximum =
    plan.source === "model_api" ? 500 : plan.source === "consumer_scrape" ? 2000 : 700;
  if (!plan.promptText.length || [...plan.promptText].length > maximum)
    throw new Error(`Exact prompt exceeds the ${maximum} character provider limit.`);
  const allowed =
    plan.source === "model_api"
      ? [
          "max_output_tokens",
          "web_search",
          "temperature",
          "cost_policy",
          "actual_cost_acknowledgement",
          "estimated_cost_limit_cents",
        ]
      : [
          "language_code",
          "location_code",
          "location_name",
          "force_web_search",
          "load_async_ai_overview",
          "device",
          "os",
        ];
  for (const key of Object.keys(plan.requestedParameters))
    if (!allowed.includes(key)) throw new Error(`Unsupported tracking parameter: ${key}.`);
  if (plan.source === "model_api") {
    modelParameters.parse(plan.requestedParameters);
    if (!plan.requestedModel) throw new Error("A Responses model is required.");
    const maximumTokens = plan.requestedParameters.max_output_tokens;
    if (
      typeof maximumTokens !== "number" ||
      !Number.isInteger(maximumTokens) ||
      maximumTokens < 16 ||
      maximumTokens > 4096
    )
      throw new Error("A bounded output token limit is required.");
  } else {
    scrapeParameters.parse(plan.requestedParameters);
    const { device, os } = plan.requestedParameters;
    if (
      (device === "desktop" && (os === "android" || os === "ios")) ||
      (device === "mobile" && (os === "windows" || os === "macos"))
    )
      throw new Error("Requested operating system does not match the device.");
    if (
      plan.source === "consumer_scrape" &&
      (plan.requestedParameters.load_async_ai_overview !== undefined ||
        plan.requestedParameters.device !== undefined ||
        plan.requestedParameters.os !== undefined)
    )
      throw new Error("Consumer scraping does not support SERP device parameters.");
    if (plan.source === "google_aio" && plan.requestedParameters.force_web_search !== undefined)
      throw new Error("Google SERP does not support consumer web-search forcing.");
    if (plan.requestedModel !== null) throw new Error("Consumer model selection is unsupported.");
    if (
      typeof plan.requestedParameters.language_code !== "string" ||
      (!Number.isInteger(plan.requestedParameters.location_code) &&
        typeof plan.requestedParameters.location_name !== "string")
    )
      throw new Error("Scraping requires a provider language and location.");
  }
}
export async function freshModelCapabilities(
  plan: SamplePlan,
  credentials: ProviderCredentials,
  request = fetch,
) {
  if (plan.source !== "model_api") return;
  assertTrackingDeadline(plan.deadline);
  const deadline = new Date(Math.min(Date.parse(plan.deadline), Date.now() + 10_000)).toISOString();
  const authorization = requireDataForSeoLogin(credentials);
  await admitTrackingRequest({ credentials, projectId: plan.projectId, deadline });
  const remaining = assertTrackingDeadline(deadline);
  const response = await request(
    `https://api.dataforseo.com/v3/ai_optimization/${plan.engine}/llm_responses/models`,
    {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(remaining),
      cache: "no-store",
      redirect: "error",
    },
  );
  const body = await readBodyWithLimit(response, 2 * 1024 * 1024);
  if (!body.ok) throw new Error("Fresh model capabilities exceed the response bound.");
  const envelope = JSON.parse(body.bytes.toString("utf8")) as TrackingEnvelope;
  if (
    !response.ok ||
    envelope.status_code !== 20000 ||
    !envelope.tasks?.length ||
    envelope.tasks.some((task) => task.status_code !== 20000)
  )
    throw new Error("Fresh model capability lookup failed.");
  const model = envelope.tasks
    .flatMap((task) => array(task.result))
    .map(object)
    .find((item) => item?.model_name === plan.requestedModel);
  if (!model || (plan.endpoint.endsWith("task_post") && model.task_post_supported !== true))
    throw new Error("The selected engine model does not support this execution method.");
  if (plan.requestedParameters.web_search === true && model.web_search_supported !== true)
    throw new Error("The selected engine model does not support web search.");
  if (
    model.reasoning === true &&
    (Number(plan.requestedParameters.max_output_tokens) < 1024 ||
      plan.requestedParameters.temperature !== undefined)
  )
    throw new Error("Requested parameters are incompatible with the reasoning model.");
}
export function trackingPayload(plan: SamplePlan, tag: string): Record<string, unknown> {
  validateTrackingRequest(plan);
  const exactPrompt =
    plan.source === "model_api"
      ? plan.promptText
      : plan.promptText.replaceAll("%", "%25").replaceAll("+", "%2B");
  const {
    cost_policy: _policy,
    actual_cost_acknowledgement: _acknowledgement,
    estimated_cost_limit_cents: _advisory,
    ...parameters
  } = plan.requestedParameters;
  return {
    ...parameters,
    ...(plan.source === "model_api"
      ? { user_prompt: exactPrompt, model_name: plan.requestedModel }
      : { keyword: exactPrompt }),
    tag,
  };
}
export function retrievalEndpoint(plan: SamplePlan, taskId: string) {
  if (!/^[a-zA-Z0-9-]{1,128}$/.test(taskId)) throw new Error("Invalid provider task identity.");
  const suffix = plan.source === "model_api" ? `task_get/${taskId}` : `task_get/advanced/${taskId}`;
  return plan.endpoint.replace(/(?:task_post|live(?:\/advanced)?)$/, suffix);
}
