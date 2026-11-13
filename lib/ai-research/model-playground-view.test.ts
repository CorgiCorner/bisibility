import { describe, expect, it } from "vitest";
import {
  type PlaygroundEntity,
  playgroundCitedDomains,
  playgroundMatrix,
  playgroundMatrixCellText,
  playgroundMatrixCsv,
  playgroundVerdict,
} from "./model-playground-view";

const project: PlaygroundEntity = {
  aliases: [],
  domain: "acme.example.com",
  excludedNames: ["Acmeology"],
  id: "project",
  kind: "project",
  label: "Acme",
};
const competitor: PlaygroundEntity = {
  aliases: ["Northwind"],
  domain: "northwind.example.org",
  excludedNames: [],
  id: "competitor",
  kind: "competitor",
  label: "Northwind",
};
const entities = [project, competitor];
const labels = {
  absent: "no",
  notNamed: "not named",
  position: (position: number) => `#${position}`,
  positionCited: (position: number) => `#${position} · cited`,
};

describe("playground verdict", () => {
  it.each([
    {
      answer: "Start with Acme, then Northwind.",
      citations: [{ url: "https://www.acme.example.com/docs" }],
      kind: "named_cited",
      name: "names the project first and cites its domain",
      position: 1,
    },
    {
      answer: "Northwind leads. Acme is second.",
      citations: [{ url: "https://northwind.example.org/list" }],
      kind: "named",
      name: "names the project after a competitor without citing it",
      position: 2,
    },
    {
      answer: "Northwind is the only directory here.",
      citations: [{ url: "https://docs.acme.example.com/guide" }],
      kind: "cited",
      name: "cites the project without naming it",
      position: null,
    },
    {
      answer: "Try a general directory.",
      citations: [{ url: "https://directory.example.org/list" }],
      kind: "absent",
      name: "neither names nor cites the project",
      position: null,
    },
    {
      answer: "Acmeology is a different product.",
      citations: [],
      kind: "absent",
      name: "ignores a name the project excludes",
      position: null,
    },
  ] as const)("$name", ({ answer, citations, kind, position }) => {
    expect(playgroundVerdict(answer, citations, entities)).toMatchObject({ kind, position });
  });
});

describe("playground matrix", () => {
  const columns = [
    {
      citations: [{ url: "https://acme.example.com/docs" }],
      id: "chat_gpt",
      text: "Acme comes first.",
    },
    {
      citations: [],
      id: "claude",
      text: "Northwind, then Acme.",
    },
    { citations: [], id: "gemini", text: null },
  ];

  it("projects who each engine names from the same answers", () => {
    const matrix = playgroundMatrix(columns, entities);
    expect(matrix.map((row) => row.entity.label)).toEqual(["Acme", "Northwind"]);
    expect(matrix[0]?.cells.map((cell) => playgroundMatrixCellText(cell, labels))).toEqual([
      "#1 · cited",
      "#2",
      "not named",
    ]);
    expect(matrix[1]?.cells.map((cell) => playgroundMatrixCellText(cell, labels))).toEqual([
      "no",
      "#1",
      "no",
    ]);
  });

  it("exports the matrix as CSV", () => {
    const matrix = playgroundMatrix(columns, entities);
    const csv = playgroundMatrixCsv(
      ["Brand", "ChatGPT", "Claude", "Gemini"],
      matrix.map((row) => [
        row.entity.kind === "project" ? `${row.entity.label} You` : row.entity.label,
        ...row.cells.map((cell) => playgroundMatrixCellText(cell, labels)),
      ]),
    );
    expect(csv).toBe(
      [
        "Brand,ChatGPT,Claude,Gemini",
        "Acme You,#1 · cited,#2,not named",
        "Northwind,no,#1,no",
      ].join("\n"),
    );
  });
});

describe("playground sources", () => {
  it("groups cited domains and names the engines that cited them", () => {
    const sources = playgroundCitedDomains(
      [
        {
          citations: [
            { url: "https://acme.example.com/a" },
            { url: "https://blog.acme.example.com/b" },
            { url: "https://directory.example.org/list" },
          ],
          label: "ChatGPT",
        },
        {
          citations: [{ url: "https://www.directory.example.org/other" }],
          label: "Claude",
        },
      ],
      {
        competitorDomains: [],
        excludedNames: [],
        overrides: [{ domain: "directory.example.org", type: "directory" }],
        ownDomain: "acme.example.com",
      },
    );
    expect(sources).toEqual([
      { count: 2, domain: "example.com", engines: ["ChatGPT"], type: "you" },
      {
        count: 2,
        domain: "example.org",
        engines: ["ChatGPT", "Claude"],
        type: "directory",
      },
    ]);
  });
});
