import { describe, expect, it } from "vitest";
import { highlightAnswerBrands } from "./answer-highlight";
import { citedSourceSummary } from "./cited-sources";

const own = {
  id: "prj_own",
  kind: "project" as const,
  label: "Acme",
  names: {
    aliases: [],
    domain: "acme.example.com",
    excludedNames: ["acme.example.org"],
    label: "Acme",
  },
};

const other = {
  id: "cmp_north",
  kind: "competitor" as const,
  label: "North",
  names: { aliases: [], domain: "north.example.org", excludedNames: [], label: "North" },
};

const tools = {
  id: "cmp_tools",
  kind: "competitor" as const,
  label: "Acme Tools",
  names: { aliases: [], domain: null, excludedNames: [], label: "Acme Tools" },
};

describe("highlightAnswerBrands", () => {
  it("keeps original casing and orders brands by the first surviving mention", () => {
    const highlight = highlightAnswerBrands("ACME beat North.", [other, own]);
    expect(highlight.segments.map((segment) => segment.text).join("")).toBe("ACME beat North.");
    expect(highlight.segments).toEqual([
      { kind: "own", text: "ACME" },
      { kind: "text", text: " beat " },
      { kind: "competitor", text: "North" },
      { kind: "text", text: "." },
    ]);
    expect(highlight.brands.map((brand) => brand.label)).toEqual(["Acme", "North"]);
  });

  it("lets the longer overlapping name win and keeps the own brand on a tie", () => {
    const longer = highlightAnswerBrands("Acme Tools shipped.", [own, tools]);
    expect(longer.segments).toEqual([
      { kind: "competitor", text: "Acme Tools" },
      { kind: "text", text: " shipped." },
    ]);
    expect(longer.brands).toEqual([{ id: "cmp_tools", kind: "competitor", label: "Acme Tools" }]);

    const tied = highlightAnswerBrands("Acme shipped.", [
      tools,
      own,
      { ...other, label: "Acme", names: { ...other.names, label: "Acme" } },
    ]);
    expect(tied.segments[0]).toEqual({ kind: "own", text: "Acme" });
    expect(tied.brands[0]?.kind).toBe("project");
  });

  it("drops a name that sits inside an excluded span", () => {
    const highlight = highlightAnswerBrands("acme.example.org is unrelated. Acme is the product.", [
      own,
    ]);
    expect(highlight.segments.filter((segment) => segment.kind !== "text")).toEqual([
      { kind: "own", text: "Acme" },
    ]);
    expect(highlight.segments.map((segment) => segment.text).join("")).toContain(
      "acme.example.org",
    );
    expect(highlight.brands).toEqual([{ id: "prj_own", kind: "project", label: "Acme" }]);
  });
});

describe("citedSourceSummary", () => {
  it("counts hosts and marks the project domain", () => {
    expect(
      citedSourceSummary(
        [
          { url: "https://www.acme.example.com/a" },
          { url: "https://acme.example.com/b" },
          { url: "https://north.example.org/c" },
        ],
        "acme.example.com",
      ),
    ).toEqual([
      { host: "acme.example.com", links: 2, own: true },
      { host: "north.example.org", links: 1, own: false },
    ]);
  });
});
