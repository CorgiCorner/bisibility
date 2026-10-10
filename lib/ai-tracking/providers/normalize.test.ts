import { samplePlan } from "@/lib/ai-tracking/execution/fixture";
import { describe, expect, it } from "vitest";
import { boundedRaw, boundedText, RAW_BYTES } from "./bounds";
import { trackingPayload, validateTrackingRequest } from "./capabilities";
import { normalizeTrackingResponse } from "./normalize";

const fetchedAt = "2026-10-08T12:00:00Z";
describe("tracking provider evidence", () => {
  it("extracts only the Google AI overview subtree and excludes ordinary SERP mentions", () => {
    const result = normalizeTrackingResponse(
      samplePlan({ source: "google_aio", engine: "google", requestedModel: null }),
      {
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            result: [
              {
                items: [
                  { type: "organic", text: "Ordinary Brand", url: "https://ordinary.test" },
                  {
                    type: "ai_overview",
                    items: [
                      {
                        type: "ai_overview_element",
                        text: "Cited Brand",
                        references: [{ url: "https://cited.test", title: "Proof" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      fetchedAt,
    );
    expect(result.evidence.answerText).toBe("Cited Brand");
    expect(result.citations.map((item) => item.url)).toEqual(["https://cited.test"]);
    expect(JSON.stringify(result.evidence.raw)).not.toContain("ordinary");
  });
  it("distinguishes absent AIO, pending, unknown and HTTP-200 task failures", () => {
    const plan = samplePlan({ source: "google_aio", engine: "google" });
    expect(
      normalizeTrackingResponse(
        plan,
        { status_code: 20000, tasks: [{ status_code: 20000, result: [{ items: [] }] }] },
        fetchedAt,
      ).measurement,
    ).toBe("aio_not_present");
    expect(
      normalizeTrackingResponse(
        plan,
        { status_code: 20000, tasks: [{ status_code: 40601 }] },
        fetchedAt,
      ).measurement,
    ).toBe("unknown");
    expect(normalizeTrackingResponse(plan, {}, fetchedAt).measurement).toBe("unknown");
    expect(
      normalizeTrackingResponse(
        plan,
        { status_code: 20000, tasks: [{ status_code: 50000 }] },
        fetchedAt,
      ).measurement,
    ).toBe("failed");
  });
  it("retains actual model and unused search results separately from cited sources", () => {
    const result = normalizeTrackingResponse(
      samplePlan(),
      {
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            result: [
              {
                model_name: "actual-model-version",
                items: [
                  {
                    type: "message",
                    sections: [{ text: "Answer", annotations: [{ url: "https://cited.test" }] }],
                  },
                ],
                search_results: [{ url: "https://unused.test" }],
              },
            ],
          },
        ],
      },
      fetchedAt,
    );
    expect(result.evidence.actualModel).toBe("actual-model-version");
    expect(result.evidence.searchResults[0].url).toBe("https://unused.test");
    expect(result.citations[0].url).toBe("https://cited.test");
    const partial = normalizeTrackingResponse(
      samplePlan(),
      {
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            result: [{ items: [{ annotations: [{ url: "https://cited.test" }] }] }],
          },
        ],
      },
      fetchedAt,
    );
    expect(partial.measurement).toBe("partial");
  });
  it("bounds UTF-8 and JSON escaping without breaking a code point", () => {
    expect(boundedText("😀😀", 5)).toEqual({ value: "😀", truncated: true });
    const raw = boundedRaw({ value: "\0".repeat(100000) });
    expect(Buffer.byteLength(JSON.stringify(raw.value))).toBeLessThanOrEqual(RAW_BYTES);
    expect(raw.truncated).toBe(true);
  });
  it("rejects exact overlong prompts and preserves plus/percent through provider decoding", () => {
    expect(() => validateTrackingRequest(samplePlan({ promptText: "x".repeat(501) }))).toThrow(
      /500/,
    );
    const plan = samplePlan({
      source: "consumer_scrape",
      requestedModel: null,
      endpoint: "ai_optimization/chat_gpt/llm_scraper/task_post",
      promptText: "A+B 100%",
      requestedParameters: { language_code: "en", location_code: 2840 },
    });
    expect(trackingPayload(plan, "tag").keyword).toBe("A%2BB 100%25");
    expect(() => validateTrackingRequest({ ...plan, promptText: "x".repeat(2001) })).toThrow(
      /2000/,
    );
  });
});
