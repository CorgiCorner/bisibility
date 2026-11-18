import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import { columnResult } from "@/lib/model-playground/result-fixtures.test-support";
import { projectColumnResult } from "@/lib/model-playground/result-view";
import aiMessages from "@/messages/core/en/project-ai-research.json";
import esMessages from "@/messages/core/es-ES/project-ai-research.json";
import jaMessages from "@/messages/core/ja/project-ai-research.json";
import plMessages from "@/messages/core/pl/project-ai-research.json";
import userEvent from "@testing-library/user-event";
import { useTranslations } from "next-intl";
import { describe, expect, it } from "vitest";
import { ModelPlaygroundColumnFooter } from "./ModelPlaygroundColumnFooter";
import { ModelPlaygroundColumnFrame } from "./ModelPlaygroundColumnFrame";
import {
  type ResultCopyKey,
  reportHint,
  reportStatusLabel,
  resultCopyKeys,
} from "./model-playground-result-copy";

// Frozen rendered copy from the pre-fix implementation, including catalog overrides.
const expectedCopy = {
  notStarted: "Not started. Refresh the estimate and try again.",
  unlinkedSources: "Records without a usable link",
  emptySource: "URL not retained",
  usageDetails: "Usage and cost details",
  apiResponse: "API response",
  settings: "Settings",
  scrollAnswers: "Answers by model, scroll sideways",
  trackedScope: "Order of first mention among tracked brands",
  unknown: "Unknown",
  retainedAnswer: "Full retained answer",
  legacyExcerpt: "Legacy excerpt; full answer was not retained",
  providerTruncated: "Provider truncated the answer",
  applicationTruncated: "Application retention limit reached",
  citationsTruncated: "Citation list truncated",
  providerSources: "Provider-returned sources",
  citationOccurrences: "Citation occurrences",
  sourcesAll: "All 4",
  totalUnknown: "Total unknown",
  retentionCounts: "5 retained; 6 omitted",
  omittedUnknown: "5 retained; omitted count unknown",
  sourceListTruncated: "Source list truncated",
  showSources: "Show all retained sources",
  hideSources: "Show fewer sources",
  showCitations: "Show all retained citations",
  hideCitations: "Show fewer citations",
  costUnavailable: "Cost unavailable",
  tokensUnknown: "Token total unknown",
  tokens: "4 tokens",
  estimatedUsage: "estimated from usage",
  reportedProvider: "reported by provider",
  subtotal: "Subtotal",
  total: "Total",
  scopeUnknown: "Cost scope unknown",
  duration: "Duration",
  inputTokens: "Input tokens",
  outputTokens: "Output tokens",
  reasoningTokens: "Reasoning tokens (within output)",
  cacheRead: "Cache read tokens",
  cacheWrite: "Cache write tokens",
  cacheAccounting: "Input cache accounting",
  searchCalls: "Search calls",
  searchTokens: "Search content tokens",
  usageCompleteness: "Usage completeness",
  basis: "Cost basis",
  rateCard: "Rate card",
  includes: "Includes",
  excludes: "Excludes",
  unknownComponents: "Unknown components",
  upstreamInference: "Upstream inference",
  localEstimate: "Local estimate",
  actualRoute: "Actual route",
  unreported: "Unreported",
  notNamed: "not named",
  seconds: "4 s",
  cacheTtl: "Cache write (4 s TTL)",
  sourceRange: "Answer offsets 7-8",
} satisfies Record<ResultCopyKey, string>;
const values = { count: 4, retained: 5, omitted: 6, start: 7, end: 8 };

function CopyProbe({ keys }: { keys: ResultCopyKey[] }) {
  const copy = useTranslations("projectAiResearch.modelPlayground");
  return keys.map((key) => (
    <span key={key} data-testid={key}>
      {copy(key, values)}
    </span>
  ));
}

const keys = Object.keys(expectedCopy) as ResultCopyKey[];

describe("model playground result copy", () => {
  it("preserves the rendered output of every key against the real catalog", () => {
    expect([...keys].sort()).toEqual([...resultCopyKeys].sort());
    const view = renderWithFeatureMessages(<CopyProbe keys={keys} />, { messages: aiMessages });
    for (const key of keys) expect(view.getByTestId(key).textContent).toBe(expectedCopy[key]);
  });

  it("honors catalog entries and interpolation", () => {
    const view = renderWithFeatureMessages(
      <CopyProbe keys={["usageDetails", "retentionCounts", "tokens", "notNamed"]} />,
      {
        messages: {
          projectAiResearch: {
            modelPlayground: {
              usageDetails: "Localized usage",
              retentionCounts: "Kept {retained}; missing {omitted}",
              tokens: "",
              notNamed: "Localized unnamed",
            },
          },
        },
      },
    );
    expect(view.getByTestId("usageDetails").textContent).toBe("Localized usage");
    expect(view.getByTestId("retentionCounts").textContent).toBe("Kept 5; missing 6");
    expect(view.getByTestId("tokens").textContent).toBe("");
    expect(view.getByTestId("notNamed").textContent).toBe("Localized unnamed");
  });
});

const localeCases = [
  ["es-ES", esMessages, "Respuesta de la API", "estimado a partir del uso"],
  ["ja", jaMessages, "API の応答", "使用量に基づく推定"],
  ["pl", plMessages, "Odpowiedź API", "oszacowano na podstawie zużycia"],
] as const;

it.each(localeCases)(
  "renders native result copy in %s without an English fallback",
  async (locale, messages, api, estimate) => {
    const source = columnResult(0);
    const column = projectColumnResult({
      ...source,
      providerCost: {
        amount: "0.0012",
        currency: "USD",
        certainty: "estimated",
        basis: "rate_card",
        rateCardVersion: "fixture-rates",
      },
      costEvidence: { providerReported: null, upstreamInference: null, localEstimate: null },
    });
    const view = renderWithFeatureMessages(
      <ModelPlaygroundColumnFrame column={column} onRemove={() => {}}>
        <ModelPlaygroundColumnFooter column={column} onFullAnswer={() => {}} />
        <CopyProbe keys={["retentionCounts"]} />
      </ModelPlaygroundColumnFrame>,
      { locale, messages },
    );
    const provenance = view.getByText(api);
    expect(provenance).not.toBeVisible();
    await userEvent.click(
      view.getByRole("button", { name: messages.projectAiResearch.modelPlayground.usageDetails }),
    );
    expect(provenance).toBeVisible();
    expect(view.container.querySelector("[data-column-cost]")).toHaveTextContent(estimate);
    expect(view.getByTestId("retentionCounts").textContent).toMatch(/5/);
    expect(view.getByTestId("retentionCounts").textContent).toMatch(/6/);
    expect(view.getByTestId("retentionCounts")).not.toHaveTextContent("retained");
  },
);

it("lets a locale reorder the entire cost summary", () => {
  const value = columnResult();
  value.costEvidence = {
    providerReported: {
      money: {
        amount: "0.25",
        currency: "USD",
        certainty: "reported",
        basis: "provider_response",
        rateCardVersion: null,
      },
      scope: { kind: "subtotal", includes: ["inference"], excludes: [], unknown: [] },
    },
    localEstimate: null,
    upstreamInference: null,
  };
  const view = renderWithFeatureMessages(
    <ModelPlaygroundColumnFooter column={projectColumnResult(value)} onFullAnswer={() => {}} />,
    {
      messages: {
        ...aiMessages,
        projectAiResearch: {
          ...aiMessages.projectAiResearch,
          modelPlayground: {
            ...aiMessages.projectAiResearch.modelPlayground,
            costLine: "{qualifier} / {amount} / {scope}",
          },
        },
      },
    },
  );
  expect(view.container.querySelector("[data-column-cost]")).toHaveTextContent(
    "reported by provider / $0.25 / Subtotal",
  );
});

it.each([
  ["en", aiMessages, ["0 tokens", "1 token", "2 tokens", "5 tokens", "22 tokens"]],
  ["es-ES", esMessages, ["0 tokens", "1 token", "2 tokens", "5 tokens", "22 tokens"]],
  ["ja", jaMessages, ["0 トークン", "1 トークン", "2 トークン", "5 トークン", "22 トークン"]],
  ["pl", plMessages, ["0 tokenów", "1 token", "2 tokeny", "5 tokenów", "22 tokeny"]],
] as const)("renders token counts in %s", (locale, messages, expected) => {
  for (const [index, count] of [0, 1, 2, 5, 22].entries()) {
    const value = columnResult();
    value.usage.inputTokens = count;
    value.usage.outputTokens = 0;
    const view = renderWithFeatureMessages(
      <ModelPlaygroundColumnFooter column={projectColumnResult(value)} onFullAnswer={() => {}} />,
      { locale, messages },
    );
    expect(view.container.querySelector("[data-column-cost]")?.textContent?.split(" · ")[1]).toBe(
      expected[index],
    );
    view.unmount();
  }
});

it("shows translated unavailable copy for a report status the client does not know", () => {
  const t = ((key: string) => `t:${key}`) as unknown as Parameters<typeof reportStatusLabel>[0];
  const unknownStatus = "archived" as unknown as Parameters<typeof reportStatusLabel>[1];
  expect(reportStatusLabel(t, unknownStatus)).toBe("t:modelPlayground.reportStatus.unavailable");
  expect(reportHint(t, unknownStatus)).toBe("t:modelPlayground.reportHints.unavailable");
});
