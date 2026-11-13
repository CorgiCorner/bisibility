import type { AnswerHighlightEntity } from "@/lib/ai-tracking/answer-highlight";
import { describe, expect, it } from "vitest";
import { projectResearchQuestions } from "./prompt-research-projection";
import { researchQuestions } from "./research-questions";
import type { AiResearchRow } from "./types";

const entities: AnswerHighlightEntity[] = [
  {
    id: "prj_example",
    kind: "project",
    label: "Example",
    names: { domain: "example.com", label: "Example" },
  },
  {
    id: "cmp_north",
    kind: "competitor",
    label: "North",
    names: { domain: "north.example.org", label: "North" },
  },
];

function row(prompt: string, answer: string, volume?: number): AiResearchRow {
  return {
    answer,
    brandMentioned: true,
    citations: [],
    datasetVolume: volume,
    domainCited: false,
    model: "chat_gpt",
    observedAt: "2026-10-02T00:00:00.000Z",
    prompt,
  };
}

describe("researchQuestions", () => {
  it("classifies grouped answers with the current names, not the stored mention flag", () => {
    const rows = [
      row("what directories list tools", "North leads", 10),
      row("which directories name both", "Example and North", 8),
      row("who publishes the catalog", "Example does", 4),
    ];
    const questions = researchQuestions(
      rows,
      projectResearchQuestions(rows, { brand: "Stored", domain: "stored.example", tracked: [] }),
      entities,
    );
    expect(questions.map((question) => question.presence)).toEqual([
      "missing",
      "shared",
      "only_you",
    ]);
    expect(questions[0]?.volume).toBe(10);
    expect(questions[2]?.youNamed).toBe(true);
  });
});
