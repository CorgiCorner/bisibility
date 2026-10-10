import type { JsonValue } from "@/lib/ai-tracking/contract";
import { samplePlan } from "@/lib/ai-tracking/execution/fixture";
import { validateTrackingRequest } from "@/lib/ai-tracking/providers/capabilities";
import { describe, expect, it } from "vitest";

const invalidModelParameters: Record<string, JsonValue>[] = [
  { max_output_tokens: 512, temperature: "hot" },
  { max_output_tokens: 512, web_search: "yes" },
  { max_output_tokens: 512, temperature: -1 },
];
const invalidConsumerParameters: Record<string, JsonValue>[] = [
  { language_code: "en", location_code: 2840, force_web_search: "yes" },
  { language_code: "en", location_code: 2840, device: { value: "desktop" } },
  { language_code: "en", location_code: 2840, device: "watch" },
];

describe("capability parameters fail closed before transport", () => {
  it.each(invalidModelParameters)(
    "rejects malformed model parameters %j",
    (requestedParameters) => {
      expect(() => validateTrackingRequest(samplePlan({ requestedParameters }))).toThrow();
    },
  );
  it.each(invalidConsumerParameters)(
    "rejects malformed consumer parameters %j",
    (requestedParameters) => {
      expect(() =>
        validateTrackingRequest(
          samplePlan({
            source: "consumer_scrape",
            requestedModel: null,
            endpoint: "ai_optimization/chat_gpt/llm_scraper/task_post",
            requestedParameters,
          }),
        ),
      ).toThrow();
    },
  );
});
