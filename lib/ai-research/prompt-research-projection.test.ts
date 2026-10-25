import { agentReportSchema } from "@/lib/agent-reports/model";
import { expect, it } from "vitest";
import { projectResearchQuestions, researchKeywords } from "./prompt-research-projection";
import { researchQuestionRow } from "./prompt-research-provider";
import { researchReportResult } from "./prompt-research-reports";
import type { AiResearchResult } from "./types";

it("groups articles, years and simple plurals with the highest-volume wording first", () => {
  const rows = [
    ...researchQuestionRow({
      question: "what are the best tools in 2025?",
      answer: "Acme tools",
      ai_search_volume: 2,
      sources: [{ url: "https://docs.acme.com/start", title: "Docs" }],
    }),
    ...researchQuestionRow({
      question: "what are best tool for 2026?",
      answer: "Other",
      ai_search_volume: 20,
      sources: [{ url: "https://docs.acme.com/start" }, { url: "https://other.com/" }],
    }),
    ...researchQuestionRow({ question: "how to pick any tool?", ai_search_volume: 1 }),
  ];
  const prompts = projectResearchQuestions(rows, {
    brand: "Acme",
    domain: "acme.com",
    tracked: ["What are the best tools in 2024?"],
  });
  expect(prompts).toHaveLength(2);
  expect(prompts[0]).toMatchObject({
    text: "What are best tool for 2026?",
    rowIndex: 1,
    variants: ["What are the best tools in 2025?"],
    tracked: true,
    brandMentioned: true,
    ownDomainCited: true,
  });
  expect(prompts[0].sources).toHaveLength(2);
  const other = projectResearchQuestions(rows, {
    brand: "Absent",
    domain: "absent.com",
    tracked: [],
  });
  expect(other[0]).toMatchObject({ tracked: false, brandMentioned: false, ownDomainCited: false });
});
it("uses literal brand boundaries and real hostname matching", () => {
  const rows = researchQuestionRow({
    question: "tools?",
    answer: "Acmeology is different.",
    sources: [{ url: "https://evil-acme.com/" }],
  });
  expect(
    projectResearchQuestions(rows, { brand: "Acme", domain: "acme.com", tracked: [] })[0],
  ).toMatchObject({ brandMentioned: false, ownDomainCited: false });
});
it("lists normalized tracker topics before deduplicated rank keywords", () => {
  expect(
    researchKeywords(
      ["  SEO Tools ", "Rank Tracker"],
      ["seo tools", "best  tools", "", "a".repeat(101)],
    ),
  ).toEqual(["seo tools", "rank tracker", "best tools"]);
});
it("keeps a full 100-row report below shared evidence limits without mutating cached rows", () => {
  const result: AiResearchResult = {
    rows: Array.from(
      { length: 100 },
      (_, n) =>
        researchQuestionRow({
          question: `question ${n}?`,
          answer: "長".repeat(6000),
          sources: Array.from({ length: 8 }, (_, i) => ({
            url: `https://example.com/${i}`,
            title: "title".repeat(60),
          })),
        })[0],
    ),
    evidence: "observed_dataset",
    totalAvailable: 100,
    truncated: false,
    fetchedAt: "2026-10-24T00:00:00Z",
    costCents: 20,
    costStatus: "confirmed",
    failure: null,
  };
  const retained = researchReportResult(result);
  expect(
    agentReportSchema.safeParse({
      kind: "prompt_research",
      title: "Questions",
      body: { result: retained },
    }).success,
  ).toBe(true);
  expect(retained.rows[0].contentTruncated).toBe(true);
  expect(result.rows[0].answer.length).toBeGreaterThan(retained.rows[0].answer.length);
});

it("keeps exact question wording when shrinking report evidence for acceptance", () => {
  const prompt = "質".repeat(500);
  const row = researchQuestionRow({
    question: prompt,
    answer: "答".repeat(100),
    sources: [{ url: `https://example.com/${"x".repeat(400)}`, title: "題".repeat(200) }],
  })[0];
  const result = researchReportResult({
    rows: [row],
    evidence: "observed_dataset",
    totalAvailable: 1,
    truncated: false,
    fetchedAt: "2026-10-24T00:00:00Z",
    costCents: 20,
    costStatus: "confirmed",
    failure: null,
  });
  expect(result.rows[0].prompt).toBe(prompt);
});
