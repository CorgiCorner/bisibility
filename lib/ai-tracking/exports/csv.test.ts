import { describe, expect, it } from "vitest";
import { type TrackingExportRow, trackingCsv } from "./csv";

const row: TrackingExportRow = {
  sampleId: "asm_example",
  runId: "air_example",
  promptRevisionId: "apr_example",
  prompt: '=HYPERLINK("https://evil.example")',
  source: "consumer_scrape",
  engine: "chat_gpt",
  actualModel: null,
  measurement: "unknown",
  observedAt: null,
  recordedSource: null,
  answer: "@malicious",
  citations: [],
  costUsd: null,
  costState: "unknown",
};
describe("tracking CSV", () => {
  it("escapes spreadsheet formulas and keeps unknown values empty with provenance", () => {
    const csv = trackingCsv([row]);
    expect(csv).toContain('"\'=HYPERLINK(""https://evil.example"")"');
    expect(csv).toContain("'@malicious");
    expect(csv).toContain("prompt_revision_id");
    expect(csv).toContain("cost_state");
  });
  it("rejects unbounded exports", () =>
    expect(() => trackingCsv(Array(1001).fill(row))).toThrow("1000"));
});
