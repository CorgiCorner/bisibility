import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  project: vi.fn(),
  topics: vi.fn(),
  competitors: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    aiTopic: { findMany: mocks.topics },
    aiTrackingSample: { findFirst: mocks.findFirst, findMany: mocks.findMany },
    competitor: { findMany: mocks.competitors },
    project: { findUnique: mocks.project },
  },
}));

import { AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT } from "../overview-model";
import { loadAiVisibilityOverview, overviewAnswerWhere } from "./overview";

function sample(id: string) {
  return {
    answerText: "Acme",
    citations: [{ url: "https://www.acme.example.com/a" }],
    engine: "chat_gpt",
    finishedAt: new Date("2026-10-19T00:00:00.000Z"),
    id,
    plan: {
      provider: "dataforseo",
      requestedParameters: { language_code: "en", location_name: "United States" },
    },
    promptRevision: { text: "What is Acme?" },
    receipt: { amountUsd: "0.001", providerCostEntryId: null, state: "confirmed" },
  };
}

describe("loadAiVisibilityOverview", () => {
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
    mocks.topics.mockResolvedValue([
      { name: "Catalogs", publicId: "ait_abcdefghijklmnopqrstuvwx" },
    ]);
    mocks.findFirst.mockResolvedValue({ id: "present" });
  });

  it("applies period, engine, topic and market before the answer limit", () => {
    const from = new Date("2026-10-11T00:00:00.000Z");
    expect(
      overviewAnswerWhere(
        "project",
        {
          engine: "chat_gpt",
          market: { kind: "name", language: "en", location: "United States" },
          period: "30d",
          promptKind: "branded",
          topic: "ait_abcdefghijklmnopqrstuvwx",
        },
        from,
      ),
    ).toEqual({
      AND: [
        { plan: { equals: "United States", path: ["requestedParameters", "location_name"] } },
        { plan: { equals: "en", path: ["requestedParameters", "language_code"] } },
      ],
      answerText: { not: null },
      engine: "chat_gpt",
      finishedAt: { gte: from },
      measurement: "answer_present",
      projectId: "project",
      promptRevision: { prompt: { topic: { publicId: "ait_abcdefghijklmnopqrstuvwx" } } },
    });
  });

  it("keeps the newest 2,000 answers and reports truncation", async () => {
    const rows = Array.from({ length: AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT + 1 }, (_, index) =>
      sample(`sample-${index}`),
    );
    mocks.findMany.mockImplementation((args: { select?: { answerText?: boolean } }) =>
      args.select?.answerText ? rows : [rows[0]],
    );
    const loaded = await loadAiVisibilityOverview({
      canAddCompetitor: true,
      now: new Date("2026-11-10T00:00:00.000Z"),
      projectId: "project",
      query: { engine: "chat_gpt" },
      timeZone: "UTC",
    });
    expect(loaded.overview.truncated).toBe(true);
    expect(loaded.overview.totalAnswers).toBe(AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT);
    expect(loaded.overview.coverage.costMicros).toBe(AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT * 1000);
    expect(loaded.overview.mentioned.named).toBe(AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT);
    expect(loaded.markets).toEqual([
      {
        key: "n:United%20States:en",
        label: "United States · English",
      },
    ]);
    expect(loaded.engines).toEqual(["chat_gpt"]);
    expect(loaded.hasAnswers).toBe(true);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
        take: AI_VISIBILITY_OVERVIEW_ANSWER_LIMIT + 1,
      }),
    );
  });
});
