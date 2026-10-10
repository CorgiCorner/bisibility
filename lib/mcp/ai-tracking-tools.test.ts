import { describe, expect, it } from "vitest";
import { aiTrackingToolDefinitions, dispatchAiTrackingTool } from "./ai-tracking-tools";

describe("AI tracking MCP REST parity", () => {
  it("routes preview as spend-free POST and forwards no idempotency field in body", () => {
    expect(
      dispatchAiTrackingTool("previewAiTrackingRun", {
        project_id: "prj_example",
        prompt_ids: ["aip_example"],
        configurations: [],
      }),
    ).toMatchObject({
      method: "POST",
      path: "/projects/prj_example/ai-tracking/runs/preview",
      body: { prompt_ids: ["aip_example"], configurations: [] },
    });
    expect(
      aiTrackingToolDefinitions.find((tool) => tool.name === "previewAiTrackingRun")?.annotations
        .readOnlyHint,
    ).toBe(true);
  });
  it("routes exact frozen suggestion previews and consented generation with header-only identity", () => {
    const preview = {
      snapshot_hash: "a".repeat(64),
      input_snapshot: { context: { business: "Exact reviewed bytes" } },
    };
    expect(
      dispatchAiTrackingTool("aiTrackingSuggestionsPreview", {
        project_id: "prj_example",
        input_snapshot: preview.input_snapshot,
      }),
    ).toMatchObject({
      method: "POST",
      path: "/projects/prj_example/ai-tracking/suggestions/preview",
      body: { input_snapshot: preview.input_snapshot },
    });
    expect(
      dispatchAiTrackingTool("aiTrackingSuggestionsGenerate", {
        project_id: "prj_example",
        preview,
        consent: true,
        idempotency_key: "stable-uuid",
      }),
    ).toMatchObject({
      method: "POST",
      path: "/projects/prj_example/ai-tracking/suggestions/generate",
      body: { preview, consent: true },
      idempotencyKey: "stable-uuid",
    });
    expect(
      aiTrackingToolDefinitions.find((tool) => tool.name === "aiTrackingSuggestionsPreview")
        ?.annotations.readOnlyHint,
    ).toBe(true);
    expect(
      aiTrackingToolDefinitions.find((tool) => tool.name === "suggestAiTrackingPrompts")
        ?.annotations.readOnlyHint,
    ).toBe(true);
    expect(
      aiTrackingToolDefinitions.find((tool) => tool.name === "aiTrackingSuggestionsGenerate")
        ?.annotations,
    ).toMatchObject({ readOnlyHint: false, openWorldHint: true });
  });
  it("binds launch idempotency header and exact prompt bytes", () => {
    const call = dispatchAiTrackingTool("createAiTrackingRun", {
      project_id: "prj_example",
      idempotency_key: "request-one",
      consent: true,
      prompt_ids: ["aip_example"],
    });
    expect(call?.idempotencyKey).toBe("request-one");
    expect(call?.body).toEqual({ consent: true, prompt_ids: ["aip_example"] });
  });
  it("preserves bounded cursors in nested sample reads and rejects missing scoped IDs", () => {
    const call = dispatchAiTrackingTool("listAiTrackingSamples", {
      project_id: "prj_example",
      run_id: "air_example",
      limit: 25,
      cursor: "a+b/c=",
    });
    expect(call?.path).toBe(
      "/projects/prj_example/ai-tracking/runs/air_example/samples?limit=25&cursor=a%2Bb%2Fc%3D",
    );
    expect(() =>
      dispatchAiTrackingTool("cancelAiTrackingRun", { project_id: "prj_example" }),
    ).toThrow("run_id");
    expect(dispatchAiTrackingTool("unrecognized", {})).toBeNull();
  });
});
