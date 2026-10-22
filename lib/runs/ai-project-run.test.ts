import { describe, expect, it } from "vitest";
import { type AiRunRecord, type AiRunSummary, aiProjectRun } from "./ai-project-run";
import { projectRunResponseSchema } from "./project-runs-api";

const at = new Date("2026-10-21T10:00:00Z");
const project = { id: "project", name: "Example", publicId: "prj_abcdefghijklmnopqrstuvwx" };
const row: AiRunRecord = {
  id: "internal",
  publicId: "air_abcdefghijklmnopqrstuvwx",
  state: "partial",
  createdAt: at,
  plannedAt: null,
  finishedAt: at,
};
const summary: AiRunSummary = {
  runId: row.id,
  total: 4,
  completed: 3,
  startedAt: at,
  known: 3,
  costCents: "0.0123",
};

describe("AI shared run projection", () => {
  it("uses the common API shape and preserves fractional confirmed costs", () => {
    const run = aiProjectRun(row, project, summary);
    expect(projectRunResponseSchema.parse(run)).toEqual(run);
    expect(run).toMatchObject({
      kind: "ai",
      progress: { completed: 3, total: 4, unit: "samples" },
      cost: { actualCents: 0.0123, state: "partial" },
    });
    expect(run.href).toBe(`/app/${project.publicId}/runs/ai/${row.publicId}`);
    expect(run.timestamps.startedAt).toBe(at.toISOString());
    expect(run.attention).not.toBeNull();
  });
  it("keeps unknown cost separate from explicit zero", () => {
    expect(
      aiProjectRun(row, project, { ...summary, known: 0, costCents: null }).cost,
    ).toMatchObject({ actualCents: null, state: "unknown" });
    expect(aiProjectRun(row, project, { ...summary, known: 4, costCents: "0" }).cost).toMatchObject(
      { actualCents: 0, state: "confirmed" },
    );
  });
  it("does not invent start time or zero actual cost for an empty skipped occurrence", () => {
    const run = aiProjectRun({ ...row, state: "skipped" }, project);
    expect(run.timestamps.startedAt).toBeNull();
    expect(run.cost).toMatchObject({ actualCents: null, state: "unknown" });
    expect(run.attention).not.toBeNull();
  });
});
