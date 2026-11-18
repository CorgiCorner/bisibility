import { modelColumnResultSchema } from "@/lib/model-playground/types";
import { transportEvidence } from "@/lib/providers/model/transport-evidence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import text from "./__fixtures__/text.json";
import { key, request } from "./adapter.test-support";
import { textModelId } from "./catalog";
import { normalizeResponse } from "./normalize";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected network");
    }),
  );
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

function normalize(body: unknown) {
  const normalized = normalizeResponse({ body, requestId: null }, textModelId, key);
  expect(
    modelColumnResultSchema.safeParse({
      ...transportEvidence(request().column, Date.now(), null),
      ...normalized,
    }).success,
  ).toBe(true);
  return normalized;
}

describe("bounded source annotations without claiming search support", () => {
  const annotation = (url = "https://EXAMPLE.org:443/source", start = 0, end = 1) => ({
    type: "url_citation",
    url_citation: { url, title: "Synthetic source", start_index: start, end_index: end },
  });
  const annotated = (annotations: unknown) => ({
    ...text,
    choices: [{ ...text.choices[0], message: { ...text.choices[0].message, annotations } }],
  });

  it("canonicalizes repeated source URLs but keeps distinct occurrences", () => {
    const result = normalize(
      annotated([annotation(), annotation("https://example.org/source", 2, 3)]),
    );
    expect(result.citations).toHaveLength(2);
    expect(result.citations[0].sourceId).toBe(result.citations[1].sourceId);
    expect(result.citations[0].occurrenceId).not.toBe(result.citations[1].occurrenceId);
    expect(result.citations[0].url).toBe("https://example.org/source");
  });

  it("marks discarded/overflowed evidence and does not retain credential URLs", () => {
    for (const annotations of [
      [annotation("https://user:pass@example.com")],
      [annotation("javascript:alert(1)")],
      [annotation(`https://example.org/${key}`)],
      [annotation(`https://example.org/${"x".repeat(2048)}`)],
      [{ type: "unknown", error: key }],
      [annotation("https://example.org", 0, 9999)],
      Array.from({ length: 101 }, () => annotation()),
    ]) {
      const result = normalize(annotated(annotations));
      expect(result.state).toBe("partial");
      expect(result.truncation.citations).toBe(true);
      expect(result.citations.length).toBeLessThanOrEqual(100);
      expect(JSON.stringify(result)).not.toContain(key);
    }
  });
});
