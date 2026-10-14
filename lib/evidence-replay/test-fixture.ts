import { makePublicId } from "@/lib/db/public-id-resources";
import { rawTextHash } from "./hash";
import type { ReplaySource } from "./model";
export const projectPublicId = makePublicId("prj");
export const codeHash = "c".repeat(64);
export const window = {
  projectId: projectPublicId,
  from: "2026-10-01T00:00:00.000Z",
  to: "2026-10-12T00:00:00.000Z",
  maxRows: 100,
  batchSize: 2,
};
export function source(
  raw: unknown = { organic_results: [{ domain: "example.test", rank: 4 }] },
  patch: Partial<ReplaySource> = {},
): ReplaySource {
  const rawText = raw === undefined ? null : JSON.stringify(raw);
  return {
    checkId: "check-original",
    checkPublicId: makePublicId("check"),
    keywordId: "keyword-original",
    keywordPublicId: makePublicId("kw"),
    checkedAtText: "2026-10-10 12:03:04.123",
    createdAtText: "2026-10-10 12:03:04.124",
    status: "completed",
    provider: "dataforseo",
    normalizationVersion: "original-v1",
    requestedDepth: 100,
    rawBytes: Buffer.byteLength(rawText ?? ""),
    rawHash: rawTextHash(rawText),
    storedHash: rawTextHash(null),
    observationHash: null,
    rawText,
    storedText: null,
    observation: null,
    ...patch,
  };
}
