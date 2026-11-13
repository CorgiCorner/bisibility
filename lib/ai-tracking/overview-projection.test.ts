import { describe, expect, it } from "vitest";
import type { OverviewAnswerInput, OverviewEntityInput } from "./overview-model";
import { projectAiVisibilityOverview } from "./overview-projection";

const own: OverviewEntityInput = {
  aliases: ["Acme Tools"],
  domain: "acme.example.com",
  excludedNames: ["acme.example.org"],
  id: "prj_own",
  kind: "project",
  label: "Acme",
};

const competitor: OverviewEntityInput = {
  aliases: ["Northwind"],
  domain: "north.example.org",
  excludedNames: [],
  id: "cmp_north",
  kind: "competitor",
  label: "North",
};

function answer(
  overrides: Partial<OverviewAnswerInput> & Pick<OverviewAnswerInput, "id">,
): OverviewAnswerInput {
  return {
    answerText: "",
    citations: [],
    costMicros: null,
    engine: "chat_gpt",
    finishedAt: "2026-10-19T15:00:00.000Z",
    promptText: "",
    provider: "dataforseo",
    ...overrides,
  };
}

const answers: OverviewAnswerInput[] = [
  answer({
    answerText: "Acme Tools and Northwind both appear.",
    citations: [
      { url: "https://acme.example.com/a" },
      { url: "https://www.acme.example.com/b" },
      { url: "https://blog.acme.example.com/not-the-site" },
      { url: "https://north.example.org/c" },
      { url: "https://guides.example.com/d" },
    ],
    costMicros: 1200,
    id: "day-1-branded",
    promptText: "What is Acme?",
  }),
  answer({
    answerText: "See north.example.org only. acme.example.org is someone else.",
    citations: [{ url: "https://guides.example.com/e" }, { url: "https://lists.example.org/f" }],
    costMicros: 1200,
    id: "day-1-unbranded",
    promptText: "best catalogs",
  }),
  answer({
    answerText: "Acme is listed.",
    citations: [{ url: "https://guides.example.com/g" }],
    finishedAt: "2026-10-20T15:00:00.000Z",
    id: "day-2-unbranded",
    promptText: "more catalogs",
  }),
  answer({
    answerText: "Same prompt again the next week.",
    citations: [],
    engine: "gemini",
    finishedAt: "2026-10-20T18:00:00.000Z",
    id: "same-prompt-another-day",
    promptText: "What is Acme?",
    provider: null,
  }),
];

function project(
  promptKind: "all" | "branded" | "unbranded" = "all",
  extra: OverviewAnswerInput[] = answers,
) {
  return projectAiVisibilityOverview({
    answers: extra,
    entities: [own, competitor],
    promptKind,
    timeZone: "UTC",
    truncated: false,
  });
}

describe("projectAiVisibilityOverview", () => {
  it("counts every stored answer, including another day of the same prompt", () => {
    const overview = project();
    expect(overview.totalAnswers).toBe(4);
    expect(overview.mentioned).toEqual({
      named: 2,
      total: 4,
      unbrandedNamed: 1,
      unbrandedTotal: 2,
    });
    expect(overview.cited).toEqual({
      cited: 1,
      links: 2,
      total: 4,
      unbrandedCited: 0,
      unbrandedTotal: 2,
    });
    expect(overview.shareOfVoice).toEqual({
      leader: { label: "Acme", mentions: 2, own: true },
      mentions: 2,
      total: 4,
    });
    expect(overview.coverage).toEqual({
      costMicros: 2400,
      dates: ["2026-10-19", "2026-10-20"],
      engines: ["chat_gpt", "gemini"],
    });
    expect(overview.days).toEqual([
      { answers: 2, citedShare: 0.5, day: "2026-10-19", mentionedShare: 0.5 },
      { answers: 2, citedShare: 0, day: "2026-10-20", mentionedShare: 0.5 },
    ]);
    expect(overview.engines).toEqual([
      { answers: 3, cited: 1, engine: "chat_gpt", named: 2, providers: ["dataforseo"] },
      { answers: 1, cited: 0, engine: "gemini", named: 0, providers: [] },
    ]);
  });

  it("keeps an excluded own-brand name from counting as a mention or a branded prompt", () => {
    const overview = project("all", [
      answer({
        answerText: "Visit acme.example.org today.",
        id: "excluded",
        promptText: "Is acme.example.org the same company?",
      }),
    ]);
    expect(overview.mentioned.named).toBe(0);
    expect(overview.mentioned.unbrandedTotal).toBe(1);
    expect(overview.shareOfVoice).toBeNull();
  });

  it("limits the view to branded prompts without dropping the unbranded wording of an empty split", () => {
    const overview = project("branded");
    expect(overview.totalAnswers).toBe(2);
    expect(overview.mentioned.unbrandedTotal).toBe(0);
    expect(overview.cited.links).toBe(2);
    expect(overview.insight).toBeNull();
    expect(overview.days).toHaveLength(2);
  });

  it("reports an empty share instead of zero percent when nothing is named", () => {
    const overview = projectAiVisibilityOverview({
      answers: [],
      entities: [own, competitor],
      promptKind: "all",
      timeZone: "UTC",
      truncated: true,
    });
    expect(overview.totalAnswers).toBe(0);
    expect(overview.shareOfVoice).toBeNull();
    expect(overview.truncated).toBe(true);
    expect(overview.brands.map((row) => [row.label, row.share, row.mentions])).toEqual([
      ["Acme", null, 0],
      ["North", null, 0],
    ]);
    expect(overview.engines).toEqual([]);
    expect(overview.insight).toBeNull();
    expect(overview.spellings).toEqual([]);
    expect(overview.coverage.costMicros).toBeNull();
  });

  it("ranks configured brands by mentions and leaves candidate mentions unknown", () => {
    const overview = project();
    const [acme, north, guides, blog, lists] = overview.brands;
    expect(acme).toMatchObject({
      answersNamed: 2,
      kind: "project",
      links: 2,
      share: { mentions: 2, total: 4 },
    });
    expect(north).toMatchObject({
      answersNamed: 2,
      kind: "competitor",
      label: "North",
      links: 1,
      share: { mentions: 2, total: 4 },
    });
    expect(guides).toMatchObject({
      answersNamed: null,
      domain: "guides.example.com",
      kind: "candidate",
      links: 3,
      mentions: null,
      share: null,
    });
    expect(blog).toMatchObject({
      domain: "blog.acme.example.com",
      kind: "candidate",
      mentions: null,
    });
    expect(lists).toMatchObject({ domain: "lists.example.org", kind: "candidate", mentions: null });
    expect(
      overview.brands.some(
        (row) => row.kind === "candidate" && row.domain === "blog.acme.example.com",
      ),
    ).toBe(true);
    expect(
      overview.brands.some((row) => row.kind === "candidate" && row.domain === "north.example.org"),
    ).toBe(false);
  });

  it("lists only the names that occur and marks aliases as removable", () => {
    const overview = project();
    expect(overview.spellings).toEqual([
      {
        entityId: "prj_own",
        kind: "project",
        label: "Acme",
        mentions: 2,
        names: [
          { count: 2, name: "Acme" },
          { count: 1, name: "Acme Tools" },
        ],
        removable: ["Acme Tools"],
      },
      {
        entityId: "cmp_north",
        kind: "competitor",
        label: "North",
        mentions: 2,
        names: [
          { count: 1, name: "North" },
          { count: 1, name: "north.example.org" },
          { count: 1, name: "Northwind" },
        ],
        removable: ["Northwind"],
      },
    ]);
  });

  it("builds the next-step insight from unbranded answers that miss the own brand", () => {
    const overview = project();
    expect(overview.insight).toEqual({
      answers: 1,
      domain: "acme.example.com",
      domains: ["guides.example.com", "lists.example.org"],
      engines: ["chat_gpt"],
      ownLinks: 0,
      totalLinks: 2,
    });
  });
});
