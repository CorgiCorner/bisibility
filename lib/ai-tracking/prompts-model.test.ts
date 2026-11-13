import { describe, expect, it } from "vitest";
import { promptsStateFromQuery, replacePromptsQuery } from "./prompts-model";

const promptId = "aip_abcdefghijklmnopqrstuvwx";

describe("prompts URL state", () => {
  it("reads the prompt, compose, view, and overview filters", () => {
    expect(
      promptsStateFromQuery({
        compose: "prompt",
        engine: "chat_gpt",
        prompt: promptId,
        range: "7d",
        tab: "prompts",
        view: "runs",
      }),
    ).toMatchObject({
      compose: "prompt",
      filters: { engine: "chat_gpt", period: "7d" },
      promptId,
      view: "runs",
    });
    expect(promptsStateFromQuery({ prompt: "not-an-id", view: "schedules" })).toMatchObject({
      compose: null,
      promptId: null,
      view: "prompts",
    });
  });

  it("keeps unrelated parameters while replacing filters, selection, and view", () => {
    const current = new URLSearchParams("extra=1&prompt=old&view=runs&range=90d");
    expect(
      replacePromptsQuery("/app/prj_example/ai-visibility", current, {
        filters: {
          engine: "gemini",
          market: null,
          period: "30d",
          promptKind: "unbranded",
          topic: null,
        },
        prompt: promptId,
        view: "prompts",
      }),
    ).toBe(
      `/app/prj_example/ai-visibility?extra=1&prompt=${promptId}&tab=prompts&engine=gemini&prompts=unbranded`,
    );
    expect(
      replacePromptsQuery("/app/prj_example/ai-visibility", current, {
        compose: null,
        view: "runs",
      }),
    ).toBe("/app/prj_example/ai-visibility?extra=1&prompt=old&view=runs&range=90d&tab=prompts");
  });
});
