import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { queuedBatchWorkflowId } from "../rank-check/queued-batches";
import { queuedRankCheckSearchAttributes } from "./rank-check-search-attributes";

function source(path: string) {
  return readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");
}

describe("queued rank-check workflow data boundary", () => {
  it("keeps keyword text and credentials out of workflow identity and search attributes", () => {
    const workflowId = queuedBatchWorkflowId({
      claimedAt: "2026-07-29T00:00:00.000Z",
      chunkIndex: 0,
      device: "desktop",
      keywordIds: ["opaque_keyword_id"],
      locationId: "location_1",
      projectId: "project_1",
    });
    const serializedAttributes = JSON.stringify(queuedRankCheckSearchAttributes("project_1"));

    expect(workflowId).toBe("queued-rank-check-project_1-location_1-desktop-1785283200000-0");
    expect(workflowId).not.toContain("private keyword text");
    expect(serializedAttributes).not.toContain('"name":"keywordId"');
    expect(serializedAttributes).not.toMatch(/credential|login|password/i);
  });

  it("keeps workflow inputs opaque and loads paid-call secrets only inside activities", () => {
    const contract = source("lib/temporal/queued-rank-check-contract.ts");
    const workflow = source("lib/temporal/queued-rank-check-workflow.ts");
    const submission = source("lib/rank-check/queued-submit.ts");

    expect(contract).not.toMatch(/\b(domain|keywordText|login|password|credentials)\??:/);
    expect(workflow).not.toMatch(/providers\/credentials|process\.env|console\./);
    expect(submission).toContain("resolveProviderCredentials");
  });
});
