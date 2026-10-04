import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import type { AiResearchResult } from "@/lib/ai-research/types";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { AiResearchResults } from "./AiResearchResults";

describe("AI research timestamp provenance", () => {
  it.each([
    ["observed_dataset", "Observed 2026-10-01", "Generated 2026-10-01"],
    ["synthetic_prompt_test", "Generated 2026-10-01", "Observed 2026-10-01"],
  ] as const)("labels %s timestamps truthfully", async (evidence, expected, absent) => {
    const messages = await loadCoreMessages("en", ["projectAiResearch"]);
    const result: AiResearchResult = {
      evidence,
      fetchedAt: "2026-10-02",
      costCents: 0.1,
      costStatus: "confirmed",
      failure: null,
      totalAvailable: null,
      truncated: false,
      rows: [
        {
          prompt: "Question",
          answer: "Answer",
          model: "model",
          observedAt: "2026-10-01",
          brandMentioned: false,
          domainCited: false,
          citations: [],
        },
      ],
    };
    render(
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
        <AiResearchResults result={result} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.queryByText(absent)).toBeNull();
  });
});
