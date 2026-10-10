import { expect, it } from "vitest";
import { trackingSampleProjection } from "./evidence";

it("recombines bounded answer columns without inventing unknown model and cost", () => {
  const sample = {
    publicId: "asm_public",
    measurement: "partial",
    source: "consumer_scrape",
    engine: "chat_gpt",
    plan: { promptText: "Exact prompt", promptRevisionId: "internal_revision" },
    promptRevision: { publicId: "apr_public", text: "Exact prompt" },
    evidence: { actualModel: null, answerTruncated: true, recordedSource: "fresh" },
    answerText: "Retained partial answer",
    raw: { observed: true },
    receipt: { amountUsd: null, state: "unknown" },
    citations: [],
  } as unknown as Parameters<typeof trackingSampleProjection>[0];
  const result = trackingSampleProjection(sample);
  expect(result).toMatchObject({
    id: "asm_public",
    promptRevisionId: "apr_public",
    costUsd: null,
    costState: "unknown",
    evidence: {
      answerText: "Retained partial answer",
      actualModel: null,
      answerTruncated: true,
      raw: { observed: true },
    },
  });
});
