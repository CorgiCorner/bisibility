import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  competitors: vi.fn(),
  findMany: vi.fn(),
  project: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    aiTrackingSample: { findMany: mocks.findMany },
    competitor: { findMany: mocks.competitors },
    project: { findUnique: mocks.project },
  },
}));

import { AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT } from "../overview-model";
import { loadAiVisibilityPromptAnswers, promptAnswerFromSample } from "./prompts";

function sample(id: string) {
  return {
    answerText: "Acme is named.",
    citations: [{ position: 1, title: "Guide", url: "https://acme.example.com/guide" }],
    engine: "chat_gpt",
    finishedAt: new Date("2026-10-19T03:10:00.000Z"),
    id,
    plan: {
      provider: "dataforseo",
      requestedParameters: { language_code: "en", location_name: "United States" },
    },
    promptRevision: {
      prompt: { publicId: "aip_abcdefghijklmnopqrstuvwx" },
      publicId: "apr_abcdefghijklmnopqrstuvwx",
      text: "What is Acme?",
    },
    publicId: `asm_${id}`,
    receipt: { amountUsd: "0.001", state: "confirmed" },
    source: "consumer_scrape",
  };
}

describe("loadAiVisibilityPromptAnswers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.project.mockResolvedValue({
      brandAliases: [],
      brandExcludedNames: [],
      domain: "acme.example.com",
      name: "Acme",
      publicId: "prj_abcdefghijklmnopqrstuvwx",
    });
    mocks.competitors.mockResolvedValue([]);
  });

  it("maps one sample batch onto prompt ids without a per-prompt query", async () => {
    mocks.findMany.mockImplementation((args: { select?: { answerText?: boolean } }) =>
      args.select?.answerText ? [sample("1")] : [sample("1")],
    );
    const loaded = await loadAiVisibilityPromptAnswers({
      now: new Date("2026-11-10T00:00:00.000Z"),
      projectId: "project",
      query: { engine: "chat_gpt", tab: "prompts" },
    });
    expect(mocks.findMany).toHaveBeenCalledTimes(2);
    expect(loaded.answers[0]).toMatchObject({
      costUsd: "0.001",
      promptId: "aip_abcdefghijklmnopqrstuvwx",
      sampleId: "asm_1",
      source: "consumer_scrape",
    });
    expect(loaded.entities[0]).toMatchObject({ domain: "acme.example.com", kind: "project" });
    expect(loaded.truncated).toBe(false);
  });

  it("keeps the newest answer limit", async () => {
    const rows = Array.from({ length: AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT + 1 }, (_, index) =>
      sample(String(index)),
    );
    mocks.findMany.mockImplementation((args: { select?: { answerText?: boolean } }) =>
      args.select?.answerText ? rows : [],
    );
    const loaded = await loadAiVisibilityPromptAnswers({
      now: new Date("2026-11-10T00:00:00.000Z"),
      projectId: "project",
      query: {},
    });
    expect(loaded.truncated).toBe(true);
    expect(loaded.answers).toHaveLength(AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT);
  });

  it("drops a sample that has no prompt", () => {
    expect(promptAnswerFromSample({ ...sample("1"), promptRevision: null })).toBeNull();
  });
});
