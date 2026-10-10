import type { JsonValue } from "@/lib/ai-tracking/contract";
import { samplePlan } from "@/lib/ai-tracking/execution/fixture";
import { expect, it, vi } from "vitest";
import {
  freshModelCapabilities,
  retrievalEndpoint,
  trackingPayload,
  validateTrackingRequest,
} from "./capabilities";

it("queries the selected engine model catalog and rejects unavailable method capability", async () => {
  const request = vi.fn(
    async (_url: RequestInfo | URL) =>
      new Response(
        JSON.stringify({
          status_code: 20000,
          tasks: [
            {
              status_code: 20000,
              result: [
                { model_name: "engine-model", task_post_supported: false, reasoning: false },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
  );
  await expect(
    freshModelCapabilities(
      samplePlan({ engine: "gemini", requestedModel: "engine-model" }),
      { login: "fixture", password: "fixture" },
      request,
    ),
  ).rejects.toThrow(/execution method/);
  expect(request.mock.calls[0][0]).toContain("/gemini/llm_responses/models");
});
it("never forwards internal consent and advisory fields to the paid provider", () => {
  const payload = trackingPayload(
    samplePlan({
      requestedParameters: {
        max_output_tokens: 512,
        cost_policy: "provider_actual_cost",
        actual_cost_acknowledgement: "non_guaranteed_estimate_v1",
        estimated_cost_limit_cents: 10,
      },
    }),
    "tag",
  );
  expect(payload).toEqual({
    max_output_tokens: 512,
    user_prompt: "Which products help?",
    model_name: "gpt-4.1-mini",
    tag: "tag",
  });
});
it("reconciles a retained live task identity through task GET instead of the live endpoint", () => {
  expect(
    retrievalEndpoint(
      samplePlan({ endpoint: "ai_optimization/chat_gpt/llm_responses/live" }),
      "known-task",
    ),
  ).toBe("ai_optimization/chat_gpt/llm_responses/task_get/known-task");
});
it.each<Record<string, JsonValue>>([
  { temperature: "hot" },
  { temperature: -1 },
  { web_search: "yes" },
])("rejects malformed model options before dispatch: %j", (parameters) => {
  expect(() =>
    validateTrackingRequest(
      samplePlan({ requestedParameters: { max_output_tokens: 512, ...parameters } }),
    ),
  ).toThrow();
});
it.each<Record<string, JsonValue>>([
  { force_web_search: "yes" },
  { device: {} },
  { device: "watch" },
  { language_code: "" },
  { location_name: "   " },
  { device: "desktop", os: "android" },
])("rejects malformed scrape options before dispatch: %j", (parameters) => {
  expect(() =>
    validateTrackingRequest(
      samplePlan({
        source: "google_aio",
        engine: "google",
        endpoint: "serp/google/organic/task_post",
        requestedModel: null,
        requestedParameters: { language_code: "en", location_code: 2840, ...parameters },
      }),
    ),
  ).toThrow();
});
