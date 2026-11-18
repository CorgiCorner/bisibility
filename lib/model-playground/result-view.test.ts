import { playgroundColumns } from "@/lib/ai-research/model-playground-view";
import { LEGACY_ANSWER_MAX_LENGTH, observedRow } from "@/lib/ai-research/normalize";
import { columnResult, entities } from "@/lib/model-playground/result-fixtures.test-support";
import { csvRow } from "@/lib/ui/csv";
import { describe, expect, it } from "vitest";
import {
  projectColumnResult,
  projectLegacyColumn,
  projectLegacyColumns,
  resultMatrix,
  resultMatrixCsv,
} from "./result-view";

describe("column result projection", () => {
  it("N2 carries the flag from the matched engine when request ID differs from row model", () => {
    const requested = [{ id: "chat_gpt", label: "Legacy", model: "requested-model" }];
    const rows = [
      {
        engine: "chat_gpt",
        model: "returned-model",
        answer: "No brand",
        citations: [],
        observedAt: null,
        contentTruncated: true,
      },
    ];
    expect(playgroundColumns(requested, rows, false)[0]).toMatchObject({
      answer: "No brand",
      contentTruncated: true,
    });
    const projected = projectLegacyColumns(requested, rows, false);
    expect(resultMatrix(projected, entities)[0]?.cells[0]).toEqual({ kind: "unknown" });
  });
  it("N3 preserves the flag when the normalized byte budget shortens an answer below the bound", () => {
    const row = observedRow(
      {
        question: "q",
        answer: "界".repeat(4001),
        model_name: "legacy",
        sources: [],
      },
      { brand: "Acme", domain: "acme.example" },
    );
    expect(row.answer.length).toBeLessThan(4000);
    expect(row.contentTruncated).toBe(true);
    const projected = projectLegacyColumns(
      [{ id: "legacy", label: "Legacy", model: null }],
      [row],
      false,
    );
    expect(resultMatrix(projected, entities)[0]?.cells[0]).toEqual({ kind: "unknown" });
  });
  it("N3 uses the normalization bound without trimming or appending a marker", () => {
    const row = observedRow(
      {
        question: "q",
        answer: `${"a".repeat(LEGACY_ANSWER_MAX_LENGTH - 2)}     `,
        model_name: "legacy",
        sources: [],
      },
      { brand: "Acme", domain: "acme.example" },
    );
    expect(row.answer).toHaveLength(LEGACY_ANSWER_MAX_LENGTH);
    expect(row.answer.endsWith("  ")).toBe(true);
    expect(row.contentTruncated).toBe(true);
  });
  it.each([
    [0, "OpenRouter"],
    [1, "Vercel AI Gateway"],
    [2, "OpenAI"],
    [3, "Anthropic"],
  ] as const)("names provider %s from its own result", (index, label) => {
    expect(projectColumnResult(columnResult(index)).providerLabel).toBe(label);
  });
  it("preserves explicit legacy truncation as unknown", () => {
    const [column] = projectLegacyColumns(
      [{ id: "old", label: "Old", model: "old" }],
      [
        {
          model: "old",
          answer: "No named brand",
          citations: [],
          observedAt: null,
          contentTruncated: true,
        },
      ],
      false,
    );
    expect(resultMatrix([column], entities)[0]?.cells[0]).toEqual({ kind: "unknown" });
  });
  it("keeps stable IDs, selected provider, actual route and measured dimensions", () => {
    const a = projectColumnResult(columnResult());
    const b = projectColumnResult(columnResult(1));
    expect(a.id).not.toBe(b.id);
    expect(a.modelId).toBe(b.modelId);
    expect(a.providerLabel).toBe("OpenRouter");
    expect(b.providerLabel).toBe("Vercel AI Gateway");
    expect(a.actualProviderId).toBe("upstream");
    expect(a.usage?.inputTokens).toBe(100);
    expect(a.durationMs).toBe(1250);
  });
  it.each(["failed", "unknown", "partial", "cancelled"] as const)(
    "does not interpret %s as absence",
    (state) => {
      const col = projectColumnResult({ ...columnResult(), state, answer: "Nothing here." });
      expect(resultMatrix([col], entities)[0]?.cells[0]).toEqual({ kind: "unknown" });
    },
  );
  it.each(["provider", "application", "citations"] as const)(
    "keeps %s truncation unknown",
    (flag) => {
      const value = columnResult();
      value.truncation[flag] = true;
      const col = projectColumnResult(value);
      expect(resultMatrix([col], entities)[0]?.cells[0]).toEqual({ kind: "unknown" });
    },
  );
  it("retains an absent project row and safe, fully identified CSV", () => {
    const value = columnResult();
    value.answer = "Nothing here.";
    const col = projectColumnResult(value);
    const rows = resultMatrix([col], [{ ...entities[0], label: "=FORMULA()" }]);
    expect(rows[0]?.cells[0]).toEqual({ kind: "not_named" });
    const csv = resultMatrixCsv([col], rows, (cell) => cell.kind);
    for (const text of [
      "Column ID",
      col.id,
      "openrouter",
      "vendor/shared-model",
      "API response",
      "'=FORMULA()",
    ])
      expect(csv).toContain(text);
  });
  it("pins every CSV byte for a fixture, including quoting and formula safety", () => {
    const data = [0, 1, 2].map((index) => projectColumnResult(columnResult(index)));
    data[1].answer = "No tracked brand appears.";
    data[2].state = "failed";
    const brands = [{ ...entities[0], label: '=Acme,"brand"', aliases: ["Acme"] }];
    const csv = resultMatrixCsv(data, resultMatrix(data, brands), (cell) =>
      cell.kind === "position" ? `#${cell.position}${cell.cited ? " cited" : ""}` : cell.kind,
    );
    expect(csv).toBe(
      [
        "Brand,Brand ID,Column ID,Column,Provider,Model,Actual provider,Actual model,Provenance,Result",
        `"'=Acme,""brand""",project,019a70b2-0000-7000-8000-000000000001,vendor/shared-model,openrouter,vendor/shared-model,upstream,vendor/shared-model,API response,#1 cited`,
        `"'=Acme,""brand""",project,019a70b2-0000-7000-8000-000000000002,vendor/shared-model,vercel_ai_gateway,vendor/shared-model,upstream,vendor/shared-model,API response,not_named`,
        `"'=Acme,""brand""",project,019a70b2-0000-7000-8000-000000000003,vendor/shared-model,openai,vendor/shared-model,upstream,vendor/shared-model,API response,unknown`,
      ].join("\n"),
    );
  });
  it("preserves reported and unknown source totals separately from occurrences", () => {
    const value = columnResult();
    const col = projectColumnResult(value);
    expect(col.consultedSources).toEqual(value.consultedSources);
    expect(col.citations).toHaveLength(8);
    expect(col.citationTotals).toEqual({ total: 8, omitted: 0 });
    delete value.consultedSources;
    delete value.citationTotals;
    const unknown = projectColumnResult(value);
    expect(unknown.consultedSources.total).toBeNull();
    expect(unknown.citationTotals.total).toBeNull();
  });
  it("adapts legacy content without assigning run-wide payment or invented usage", () => {
    const col = projectLegacyColumn({
      id: "chat_gpt",
      label: "ChatGPT",
      model: "legacy-model",
      answer: "Acme",
      citations: [{ url: "https://acme.example" }],
      failed: false,
      observedAt: "2026-11-10T12:00:00Z",
    });
    expect(col.label).toBe("ChatGPT");
    expect(col.answer).toBe("Acme");
    expect(col.modelId).toBe("legacy-model");
    expect(col.observedAt).toBe("2026-11-10T12:00:00Z");
    expect(col.cost.money.amount).toBeNull();
    expect(col.usage).toBeNull();
    expect(col.legacyExcerpt).toBe(false);
  });
  it("R11 accepts null CSV cells and neutralizes tab and carriage return", () => {
    expect(csvRow([null, "\t=SUM(1)", "\r@formula", "safe"])).toBe(
      ",'\t=SUM(1),\"'\r@formula\",safe",
    );
  });
});

it("keeps the native result's original funding source", () => {
  const result = columnResult();
  result.column = {
    ...result.column,
    connectionId: "platform:openai",
    providerId: "openai",
    payment: { optionId: "platform:openai", fundingSource: "platform" },
  };
  expect(projectColumnResult(result).fundingSource).toBe("platform");
});
