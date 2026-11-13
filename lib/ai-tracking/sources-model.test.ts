import { describe, expect, it } from "vitest";
import type { SourceCatalog } from "./source-catalog";
import { projectAiVisibilitySources, type SourceProjectionInput } from "./sources-model";

const catalog = {
  community: [] as string[],
  directory: ["example.org"],
  editorial: [] as string[],
  reviews: ["example.org"],
} satisfies SourceCatalog;

function answer(
  id: string,
  promptText: string,
  answerText: string,
  urls: string[],
): SourceProjectionInput["answers"][number] {
  return {
    answerText,
    citations: urls.map((url) => ({ url })),
    costMicros: null,
    engine: "chat_gpt",
    finishedAt: "2026-10-19T00:00:00.000Z",
    id,
    promptText,
    provider: "dataforseo",
  };
}

function project(promptKind: SourceProjectionInput["promptKind"] = "all", truncated = false) {
  return projectAiVisibilitySources({
    answers: [
      answer("named", "best tools", "Acme is listed here", [
        "https://www.example.com/pricing",
        "https://www.example.com/pricing",
        "https://blog.example.com/about",
        "https://reviews.example.org/acme",
      ]),
      answer("unnamed", "best tools", "A directory and a rival", [
        "https://directory.example.org/list",
        "https://shop.example.org/item",
        "https://notes.example.org/post",
      ]),
      answer("branded-prompt", "What is Acme?", "No citations here", []),
    ],
    catalog,
    competitors: [],
    overrides: [{ domain: "example.org", type: "editorial" }],
    own: {
      aliases: [],
      domain: "www.example.com",
      excludedNames: ["Acme Tools"],
      label: "Acme",
    },
    plan: [
      {
        domain: "example.org",
        note: "Ask for a listing",
        state: "todo",
        url: "https://directory.example.org/list",
      },
    ],
    promptKind,
    truncated,
  });
}

describe("AI Visibility sources projection", () => {
  it("counts domains and pages from citations and keeps the type precedence", () => {
    const sources = project();
    expect(sources.totalAnswers).toBe(3);
    expect(sources.citedDomains).toBe(2);
    expect(sources.yourSite).toEqual({ allNamed: true, links: 3, unnamedLinks: 0 });
    expect(sources.withoutNameLinks).toBe(0);
    expect(sources.unnamedOtherDomains).toBe(1);
    expect(sources.truncated).toBe(false);
    expect(
      sources.rows.map((row) => [
        row.domain,
        row.type,
        row.origin,
        row.answers,
        row.links,
        row.planState,
      ]),
    ).toEqual([
      ["example.org", "editorial", "override", 2, 4, "todo"],
      ["example.com", "you", "you", 1, 3, null],
    ]);
    expect(sources.pages.find((row) => row.url === "https://shop.example.org/item")).toMatchObject({
      domain: "example.org",
      type: "editorial",
    });
    expect(sources.plan).toEqual([
      {
        domain: "example.org",
        note: "Ask for a listing",
        state: "todo",
        type: "editorial",
        url: "https://directory.example.org/list",
      },
    ]);
  });

  it("drops branded prompts and reports truncation", () => {
    const sources = project("unbranded", true);
    expect(sources.totalAnswers).toBe(2);
    expect(sources.truncated).toBe(true);
    expect(sources.rows.some((row) => row.domain === "example.com")).toBe(true);
    expect(project("branded").rows.map((row) => row.domain)).toEqual([]);
  });
});
