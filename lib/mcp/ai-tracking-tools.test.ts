import { describe, expect, it } from "vitest";
import { dispatchPromptTrackerTool, promptTrackerToolDefinitions } from "./ai-tracking-tools";

describe("Prompt Tracker MCP REST parity", () => {
  it("routes preview as spend-free POST and forwards no idempotency field in body", () => {
    expect(
      dispatchPromptTrackerTool("previewPromptTrackerRun", {
        project_id: "prj_example",
        prompt_ids: ["aip_example"],
        configurations: [],
      }),
    ).toMatchObject({
      method: "POST",
      path: "/projects/prj_example/prompt-tracker/runs/preview",
      body: { prompt_ids: ["aip_example"], configurations: [] },
    });
    expect(
      promptTrackerToolDefinitions.find((tool) => tool.name === "previewPromptTrackerRun")
        ?.annotations.readOnlyHint,
    ).toBe(true);
  });
  it("routes exact frozen suggestion previews and consented generation with header-only identity", () => {
    const preview = {
      snapshot_hash: "a".repeat(64),
      input_snapshot: { context: { business: "Exact reviewed bytes" } },
    };
    expect(
      dispatchPromptTrackerTool("promptResearchSuggestionsPreview", {
        project_id: "prj_example",
        input_snapshot: preview.input_snapshot,
      }),
    ).toMatchObject({
      method: "POST",
      path: "/projects/prj_example/prompt-research/suggestions/preview",
      body: { input_snapshot: preview.input_snapshot },
    });
    expect(
      dispatchPromptTrackerTool("promptResearchSuggestionsGenerate", {
        project_id: "prj_example",
        preview,
        consent: true,
        idempotency_key: "stable-uuid",
      }),
    ).toMatchObject({
      method: "POST",
      path: "/projects/prj_example/prompt-research/suggestions/generate",
      body: { preview, consent: true },
      idempotencyKey: "stable-uuid",
    });
    expect(
      promptTrackerToolDefinitions.find((tool) => tool.name === "promptResearchSuggestionsPreview")
        ?.annotations.readOnlyHint,
    ).toBe(true);
    expect(
      promptTrackerToolDefinitions.find((tool) => tool.name === "suggestPromptResearchPrompts")
        ?.annotations.readOnlyHint,
    ).toBe(true);
    expect(
      promptTrackerToolDefinitions.find((tool) => tool.name === "promptResearchSuggestionsGenerate")
        ?.annotations,
    ).toMatchObject({ readOnlyHint: false, openWorldHint: true });
  });
  it("binds launch idempotency header and exact prompt bytes", () => {
    const call = dispatchPromptTrackerTool("createPromptTrackerRun", {
      project_id: "prj_example",
      idempotency_key: "request-one",
      consent: true,
      prompt_ids: ["aip_example"],
    });
    expect(call?.idempotencyKey).toBe("request-one");
    expect(call?.body).toEqual({ consent: true, prompt_ids: ["aip_example"] });
  });
  it("preserves bounded cursors in nested sample reads and rejects missing scoped IDs", () => {
    const call = dispatchPromptTrackerTool("listPromptTrackerSamples", {
      project_id: "prj_example",
      run_id: "air_example",
      limit: 25,
      cursor: "a+b/c=",
    });
    expect(call?.path).toBe(
      "/projects/prj_example/prompt-tracker/runs/air_example/samples?limit=25&cursor=a%2Bb%2Fc%3D",
    );
    expect(() =>
      dispatchPromptTrackerTool("cancelPromptTrackerRun", { project_id: "prj_example" }),
    ).toThrow("run_id");
    expect(dispatchPromptTrackerTool("unrecognized", {})).toBeNull();
  });
  it("forwards the CSV format for the evidence export", () => {
    const call = dispatchPromptTrackerTool("exportPromptTrackerEvidence", {
      project_id: "prj_example",
      run_id: "air_example",
      format: "csv",
      limit: 50,
    });
    expect(call?.method).toBe("GET");
    const params = new URLSearchParams(call?.path.split("?")[1] ?? "");
    expect(params.get("format")).toBe("csv");
    expect(params.get("run_id")).toBe("air_example");
    expect(params.get("limit")).toBe("50");
  });
});
