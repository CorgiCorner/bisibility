import type { OverviewEntityInput, OverviewFilters } from "@/lib/ai-tracking/overview-model";
import { projectAiVisibilityOverview } from "@/lib/ai-tracking/overview-projection";
import type { PromptAnswerRecord, PromptProjectionPrompt } from "@/lib/ai-tracking/prompts-model";
import { describe, expect, it } from "vitest";
import { groupPromptRows, overlayPromptRows, projectPromptOutcomes } from "./prompts-projection";

const filters: OverviewFilters = {
  engine: null,
  market: null,
  period: "30d",
  promptKind: "all",
  topic: null,
};

const own: OverviewEntityInput = {
  aliases: [],
  domain: "acme.example.com",
  excludedNames: [],
  id: "prj_own",
  kind: "project",
  label: "Acme",
};

const north: OverviewEntityInput = {
  aliases: [],
  domain: "north.example.org",
  excludedNames: [],
  id: "cmp_north",
  kind: "competitor",
  label: "North",
};

function prompt(
  overrides: Partial<PromptProjectionPrompt> & Pick<PromptProjectionPrompt, "id" | "text">,
): PromptProjectionPrompt {
  return {
    configuredEngines: [],
    provenance: "manual",
    revision: 1,
    status: "active",
    topicId: "ait_tools",
    topicName: "Tools",
    ...overrides,
  };
}

function answer(
  overrides: Partial<PromptAnswerRecord> & Pick<PromptAnswerRecord, "answerText" | "promptId">,
): PromptAnswerRecord {
  return {
    citations: [],
    costMicros: 1000,
    costState: "confirmed",
    costUsd: "0.001",
    engine: "chat_gpt",
    finishedAt: "2026-10-19T03:10:00.000Z",
    id: overrides.promptId,
    promptRevisionId: "apr_abcdefghijklmnopqrstuvwx",
    promptText: "Which tools help a small team?",
    provider: "dataforseo",
    sampleId: overrides.promptId,
    source: "consumer_scrape",
    ...overrides,
  };
}

describe("projectPromptOutcomes", () => {
  const prompts = [
    prompt({
      configuredEngines: ["gemini"],
      id: "aip_tools",
      text: "Which tools help a small team?",
    }),
    prompt({
      id: "aip_brand",
      text: "What is Acme?",
      topicId: "ait_brand",
      topicName: "Brand",
    }),
    prompt({ id: "aip_plain", text: "Where should a team start?", topicId: null, topicName: null }),
  ];
  const answers = [
    answer({
      answerText: "North is listed. Acme too.",
      citations: [{ position: 1, title: "Guide", url: "https://www.acme.example.com/guide" }],
      promptId: "aip_tools",
      sampleId: "asm_tools_chatgpt",
    }),
    answer({
      answerText: "Only North appears.",
      citations: [{ position: 1, title: null, url: "https://north.example.org/list" }],
      engine: "gemini",
      finishedAt: "2026-10-18T03:10:00.000Z",
      promptId: "aip_tools",
      sampleId: "asm_tools_gemini",
      source: "consumer_scrape",
    }),
    answer({
      answerText: "An older ChatGPT answer names North.",
      finishedAt: "2026-10-01T03:10:00.000Z",
      promptId: "aip_tools",
      sampleId: "asm_tools_old",
    }),
  ];

  it("matches the overview numbers for that prompt's answers", () => {
    const projected = projectPromptOutcomes({
      answers,
      entities: [own, north],
      filters,
      prompts,
      selectedPromptId: "aip_tools",
      timeZone: "UTC",
    });
    const row = projected.rows.find((item) => item.id === "aip_tools");
    const overview = projectAiVisibilityOverview({
      answers: answers.filter((item) => item.promptId === "aip_tools"),
      entities: [own, north],
      promptKind: "all",
      timeZone: "UTC",
      truncated: false,
    });
    expect(row).toMatchObject({
      cited: overview.cited.cited,
      named: overview.mentioned.named,
      total: overview.mentioned.total,
      type: "unbranded",
    });
    expect(row?.leader).toEqual(
      overview.shareOfVoice
        ? { label: overview.shareOfVoice.leader.label, own: overview.shareOfVoice.leader.own }
        : null,
    );
    expect(row?.leader?.own).toBe(false);
    expect(row?.engines).toEqual(["chat_gpt", "gemini"]);
    expect(row?.lastRunAt).toBe("2026-10-19T03:10:00.000Z");
    expect(projected.rows.find((item) => item.id === "aip_brand")?.type).toBe("branded");
    expect(projected.panel?.answers.map((item) => item.id)).toEqual([
      "asm_tools_chatgpt",
      "asm_tools_gemini",
    ]);
    expect(projected.panel?.answers[0]?.text).toBe("North is listed. Acme too.");
  });

  it("hides prompts outside the topic and type filters", () => {
    const branded = projectPromptOutcomes({
      answers,
      entities: [own, north],
      filters: { ...filters, promptKind: "branded", topic: "ait_brand" },
      prompts,
      selectedPromptId: "aip_tools",
      timeZone: "UTC",
    });
    expect(branded.rows.map((row) => row.id)).toEqual(["aip_brand"]);
    expect(branded.panel).toBeNull();
  });

  it("groups by topic and leaves prompts without a topic last", () => {
    const projected = projectPromptOutcomes({
      answers,
      entities: [own, north],
      filters,
      prompts,
      selectedPromptId: null,
      timeZone: "UTC",
    });
    const grouped = groupPromptRows(projected.rows);
    expect(grouped.filter((row) => row.kind === "section").map((row) => row.topicName)).toEqual([
      "Brand",
      "Tools",
      null,
    ]);
    expect(
      grouped.find((row) => row.kind === "section" && row.topicName === "Tools"),
    ).toMatchObject({ count: 1 });
  });

  it("overlays a moved prompt and appends a prompt that has no stored answers", () => {
    const projected = projectPromptOutcomes({
      answers,
      entities: [own, north],
      filters,
      prompts,
      selectedPromptId: null,
      timeZone: "UTC",
    });
    const overlaid = overlayPromptRows(
      projected.rows,
      [
        ...prompts.map((item) =>
          item.id === "aip_tools"
            ? { ...item, status: "paused" as const, topicId: "ait_brand", topicName: "Brand" }
            : item,
        ),
        prompt({ id: "aip_new", text: "A fresh question?", topicId: null, topicName: null }),
      ],
      filters,
      [own, north],
    );
    expect(overlaid.find((row) => row.id === "aip_tools")).toMatchObject({
      named: projected.rows.find((row) => row.id === "aip_tools")?.named,
      status: "paused",
      topicName: "Brand",
    });
    expect(overlaid.find((row) => row.id === "aip_new")).toMatchObject({
      named: 0,
      total: 0,
      type: "unbranded",
    });
  });
});
