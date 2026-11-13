import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  competitors: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  overrides: vi.fn(),
  plan: vi.fn(),
  project: vi.fn(),
  topics: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    aiSourcePlanItem: { findMany: mocks.plan },
    aiSourceTypeOverride: { findMany: mocks.overrides },
    aiTopic: { findMany: mocks.topics },
    aiTrackingSample: { findFirst: mocks.findFirst, findMany: mocks.findMany },
    competitor: { findMany: mocks.competitors },
    project: { findUnique: mocks.project },
  },
}));

import { AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT } from "../overview-model";
import { loadAiVisibilitySources } from "./sources";

function sample(id: string) {
  return {
    answerText: "Acme",
    citations: [{ url: "https://www.notes.example.org/a" }],
    engine: "chat_gpt",
    finishedAt: new Date("2026-10-19T00:00:00.000Z"),
    id,
    plan: {
      provider: "dataforseo",
      requestedParameters: { language_code: "en", location_name: "United States" },
    },
    promptRevision: { text: "best tools" },
    receipt: { amountUsd: "0.001" },
  };
}

describe("loadAiVisibilitySources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.project.mockResolvedValue({
      brandAliases: [],
      brandExcludedNames: [],
      domain: "acme.example.com",
      name: "Acme",
    });
    mocks.competitors.mockResolvedValue([]);
    mocks.topics.mockResolvedValue([]);
    mocks.overrides.mockResolvedValue([]);
    mocks.plan.mockResolvedValue([]);
    mocks.findFirst.mockResolvedValue({ id: "present" });
    mocks.findMany.mockResolvedValue([sample("sample_1")]);
  });

  it("reuses the overview answer limit and reports one extra row as truncation", async () => {
    mocks.findMany.mockImplementation((args: { take?: number }) =>
      Promise.resolve(
        Array.from({ length: args.take ?? 0 }, (_, index) => sample(`sample_${index}`)),
      ),
    );
    const loaded = await loadAiVisibilitySources({
      canWrite: false,
      now: new Date("2026-11-10T00:00:00.000Z"),
      projectId: "project",
      query: { prompts: "unbranded", range: "7d" },
    });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT + 1 }),
    );
    expect(loaded.sources.truncated).toBe(true);
    expect(loaded.sources.totalAnswers).toBe(AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT);
    expect(loaded.sources.rows).toEqual([
      expect.objectContaining({
        answers: AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT,
        domain: "example.org",
      }),
    ]);
    expect(loaded.canWrite).toBe(false);
    expect(loaded.filters.promptKind).toBe("unbranded");
  });
});
