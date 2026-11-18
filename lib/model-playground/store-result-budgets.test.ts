import { expect, it } from "vitest";
import { preview, result } from "./contract-fixtures.test-support";
import { MODEL_PLAYGROUND_LIMITS, utf8Bytes } from "./schema";
import { extendedResult } from "./store-result.test-support";
import { storedPreview } from "./store-validation";
import { modelColumnResultSchema, serializeModelPlaygroundReport } from "./types";

it("serializes extended results and legacy snapshots without injecting optional keys", () => {
  const old = JSON.parse(JSON.stringify(preview()));
  expect(storedPreview(old)).toEqual(old);
  for (const value of [result(), extendedResult()]) {
    const serialized = serializeModelPlaygroundReport([value], old);
    expect(JSON.parse(serialized.body).columns).toEqual([value]);
    expect(JSON.parse(serialized.provenance)).toEqual(old);
  }
});

it("counts consulted sources in the report byte budget", () => {
  const value = extendedResult();
  value.consultedSources = {
    sources: Array.from({ length: 100 }, (_, i) => ({
      sourceId: `consulted-${i}`,
      url: `https://example.org/${i}/${"a".repeat(2000)}`,
      title: "a".repeat(512),
    })),
    total: 100,
    omitted: 0,
    truncated: false,
  };
  value.answer = "a".repeat(MODEL_PLAYGROUND_LIMITS.answerBytes);
  expect(modelColumnResultSchema.safeParse(value).success).toBe(true);
  expect(utf8Bytes(JSON.stringify(value))).toBeGreaterThan(MODEL_PLAYGROUND_LIMITS.reportBytes);
  expect(() => serializeModelPlaygroundReport([value], preview())).toThrow(/byte budget/);
});

it("retains independent provenance guards at the exact byte boundary", () => {
  // A lowered limit exercises the independent guards with a valid legacy snapshot.
  const value = preview();
  const size = utf8Bytes(JSON.stringify(value));
  const limits: { provenanceBytes: number } = MODEL_PLAYGROUND_LIMITS;
  const original = limits.provenanceBytes;
  try {
    limits.provenanceBytes = size;
    expect(storedPreview(value)).toEqual(value);
    expect(() => serializeModelPlaygroundReport([extendedResult()], value)).not.toThrow();
    limits.provenanceBytes = size - 1;
    expect(() => storedPreview(value)).toThrow("invalid_snapshot");
    expect(() => serializeModelPlaygroundReport([extendedResult()], value)).toThrow(/byte budget/);
  } finally {
    limits.provenanceBytes = original;
  }
});
