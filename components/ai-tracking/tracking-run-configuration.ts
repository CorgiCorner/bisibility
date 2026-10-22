import type { SourceConfiguration } from "@/lib/ai-tracking/contract";
import type { trackingConfigurationForm } from "@/lib/ai-tracking/projections/forms";
import type { z } from "zod";

export function trackingEngines(
  source: SourceConfiguration["source"],
): SourceConfiguration["engine"][] {
  return source === "google_aio"
    ? ["google"]
    : source === "consumer_scrape"
      ? ["chat_gpt", "gemini"]
      : ["chat_gpt"];
}
export function trackingRunConfigurations(
  values: z.infer<typeof trackingConfigurationForm>,
): SourceConfiguration[] {
  const engines = trackingEngines(values.source);
  const engine = engines.includes(values.engine) ? values.engine : (engines[0] ?? "chat_gpt");
  return [
    {
      provider: "dataforseo",
      source: values.source,
      engine,
      endpoint:
        values.source === "google_aio"
          ? "serp/google/organic/task_post"
          : `ai_optimization/${engine}/${values.source === "model_api" ? "llm_responses" : "llm_scraper"}/task_post`,
      model: values.source === "model_api" ? values.model : null,
      parameters:
        values.source === "model_api"
          ? {
              max_output_tokens: 1024,
              web_search: false,
              cost_policy: "provider_actual_cost",
              actual_cost_acknowledgement: "non_guaranteed_estimate_v1",
              estimated_cost_limit_cents: 100,
            }
          : { language_code: values.locale, location_name: values.location },
    },
  ];
}
