import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { columnResult, entities } from "@/lib/model-playground/result-fixtures.test-support";
import { projectColumnResult } from "@/lib/model-playground/result-view";
import aiMessages from "@/messages/core/en/project-ai-research.json";
import trackingMessages from "@/messages/core/en/project-ai-tracking.json";
import historyMessages from "@/messages/core/en/research-history.json";
import sharedMessages from "@/messages/core/en/shared.json";
import esMessages from "@/messages/core/es-ES/project-ai-research.json";
import trackingEs from "@/messages/core/es-ES/project-ai-tracking.json";
import historyEs from "@/messages/core/es-ES/research-history.json";
import sharedEs from "@/messages/core/es-ES/shared.json";
import jaMessages from "@/messages/core/ja/project-ai-research.json";
import trackingJa from "@/messages/core/ja/project-ai-tracking.json";
import historyJa from "@/messages/core/ja/research-history.json";
import sharedJa from "@/messages/core/ja/shared.json";
import plMessages from "@/messages/core/pl/project-ai-research.json";
import trackingPl from "@/messages/core/pl/project-ai-tracking.json";
import historyPl from "@/messages/core/pl/research-history.json";
import sharedPl from "@/messages/core/pl/shared.json";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import {
  assertColumnScrollPositions,
  assertMatrixLayout,
} from "./ModelPlaygroundColumns.layout-test";
import { ModelPlaygroundResults } from "./ModelPlaygroundResults";

const localeMessages = {
  en: { ...sharedMessages, ...historyMessages, ...aiMessages, ...trackingMessages },
  "es-ES": { ...sharedEs, ...historyEs, ...esMessages, ...trackingEs },
  ja: { ...sharedJa, ...historyJa, ...jaMessages, ...trackingJa },
  pl: { ...sharedPl, ...historyPl, ...plMessages, ...trackingPl },
};
const messages = {
  ...sharedMessages,
  ...trackingMessages,
  ...historyMessages,
  ...aiMessages,
  projectAiResearch: {
    ...aiMessages.projectAiResearch,
    modelPlayground: { ...aiMessages.projectAiResearch.modelPlayground },
  },
};
const money = {
  amount: "0.0012",
  currency: "USD",
  certainty: "reported" as const,
  basis: "provider_response" as const,
  rateCardVersion: null,
};
const play: NonNullable<Meta<typeof ModelPlaygroundResults>["play"]> = async ({
  canvasElement,
}) => {
  assertMatrixLayout(canvasElement);
  await assertColumnScrollPositions(canvasElement);
  const cards = canvasElement.querySelectorAll<HTMLElement>("article[data-column-id]");
  await expect(cards.length).toBeGreaterThan(0);
  for (const card of cards) {
    const box = card.getBoundingClientRect();
    const style = getComputedStyle(card);
    const left =
      box.left + Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.paddingLeft);
    const right =
      box.right - Number.parseFloat(style.borderRightWidth) - Number.parseFloat(style.paddingRight);
    for (const button of card.querySelectorAll(".model-playground-disclosure")) {
      const bounds = button.getBoundingClientRect();
      await expect(
        Math.abs(bounds.left - left),
        "Disclosure border aligns to content",
      ).toBeLessThanOrEqual(0.5);
      await expect(bounds.right, "Disclosure border stays inside content").toBeLessThanOrEqual(
        right + 0.5,
      );
    }
  }
};

const meta = {
  title: "Research/Model Playground Results",
  component: ModelPlaygroundResults,
  parameters: { layout: "padded", themeControls: false, nextjs: { appDirectory: true } },
  args: {
    canTrack: false,
    columns: [],
    entities,
    funding: null,
    onRemove: () => {},
    onSettings: () => {},
    projectId: "prj_fixture",
    prompt: "Compare these tracked brands.",
    running: false,
    sourceContext: { competitorDomains: [], excludedNames: [], overrides: [], ownDomain: null },
    topics: [],
    unfinished: false,
  },
  decorators: [
    (Story, context) => (
      <FeatureMessagesProvider
        locale={context.parameters.locale ?? "en"}
        messages={{
          ...messages,
          ...localeMessages[(context.parameters.locale ?? "en") as keyof typeof localeMessages],
        }}
        timeZone="UTC"
      >
        <Story />
      </FeatureMessagesProvider>
    ),
  ],
} satisfies Meta<typeof ModelPlaygroundResults>;
export default meta;
type Story = StoryObj<typeof meta>;
function columns(count: number) {
  return Array.from({ length: count }, (_, i) => projectColumnResult(columnResult(i)));
}
export const OneColumn: Story = { play, args: { resultColumns: columns(1) } };
export const ThreeColumns: Story = { play, args: { resultColumns: columns(3) } };
export const SixColumns: Story = { play, args: { resultColumns: columns(6) } };
const longEntities = [
  entities[1],
  {
    ...entities[0],
    aliases: ["Acme"],
    label: `A very long tracked brand name that stays reachable ${"long-brand-name".repeat(12)}`,
  },
];
function longColumns(count: number) {
  return Array.from({ length: count }, (_, i) =>
    projectColumnResult(
      {
        ...columnResult(i),
        answer: `Acme. ${"Long retained answer with useful evidence. ".repeat(120)}Final retained sentence.`,
      },
      `A very long model name / version / ${"extra-long-model-identifier-".repeat(8)}`,
    ),
  );
}
export const LongThreeColumns: Story = {
  play,
  args: { resultColumns: longColumns(3), entities: longEntities },
};
export const LongContent: Story = {
  play,
  args: { resultColumns: longColumns(6), entities: longEntities },
};
export const HonestMoneyAndUnknowns: Story = {
  play,
  args: {
    resultColumns: Array.from({ length: 6 }, (_, i) => {
      const value = columnResult(i);
      if (i === 1)
        value.providerCost = {
          ...money,
          certainty: "estimated",
          basis: "rate_card",
          rateCardVersion: "fixture-rates-v1",
        };
      if (i === 2 || i === 3) value.providerCost = money;
      if (i === 3)
        value.costEvidence = {
          providerReported: {
            money,
            scope: {
              kind: "subtotal",
              includes: ["inference"],
              excludes: ["tools"],
              unknown: ["routing", "reporting_writes", "zero_data_retention", "other"],
            },
          },
          localEstimate: null,
          upstreamInference: null,
        };
      if (i === 4) {
        value.state = "failed";
        value.failure = "timeout";
        value.answer = null;
        value.citations = [];
        value.citationTotals = { total: null, omitted: null };
      }
      if (i === 5) {
        value.state = "partial";
        value.truncation.application = true;
      }
      return projectColumnResult(value);
    }),
  },
};
const legacyQuote = paymentQuote({
  charge: { value: "1.23", certainty: "measured", unit: { kind: "currency", code: "USD" } },
});
export const Legacy: Story = {
  play,
  args: {
    columns: [{ id: "legacy", label: "Legacy model", model: "retained-model" }],
    onSettings: undefined,
    funding: "byok",
    payment: {
      actionId: "action-1",
      quoteId: legacyQuote.id,
      option: legacyQuote.option,
      charge: legacyQuote.charge,
      state: "settled",
    },
    sourceContext: {
      competitorDomains: ["northwind.example"],
      excludedNames: [],
      overrides: [],
      ownDomain: "acme.example",
    },
    result: {
      rows: [
        {
          answer: "Acme is named in this complete legacy answer.",
          brandMentioned: true,
          domainCited: false,
          citations: [
            { url: "https://acme.example/docs", title: "Acme docs", targetDomain: true },
            { url: "https://northwind.example/", title: "Northwind", targetDomain: false },
          ],
          model: "legacy",
          observedAt: "2026-11-10 12:00:00 +00:00",
          prompt: "Compare",
        },
      ],
      failure: null,
      costCents: 10,
      costStatus: "confirmed",
      evidence: "synthetic_prompt_test",
      fetchedAt: "2026-11-10T12:00:00Z",
      totalAvailable: null,
      truncated: false,
    },
  },
};

const retainedRun = {
  runId: "019a70b2-0000-7000-8000-000000000001",
  input: {
    version: 1 as const,
    prompt: "Compare these tracked brands.",
    responseLanguage: "en",
    columns: [columnResult(0).column],
  },
};
const retainedArgs = { retainedRun, resultColumns: columns(1), onSaveReport: () => {} };
export const ReportPending: Story = { args: { ...retainedArgs, reportSaveStatus: "pending" } };
export const ReportCheckFailed: Story = {
  args: { ...retainedArgs, reportSaveStatus: "check_failed" },
};
export const ReportStorage: Story = { args: { ...retainedArgs, reportSaveStatus: "storage" } };
export const ReportForbidden: Story = { args: { ...retainedArgs, reportSaveStatus: "forbidden" } };
export const ReportReadOnly: Story = { args: { ...retainedArgs, reportSaveStatus: "read_only" } };
export const ReportTooLarge: Story = { args: { ...retainedArgs, reportSaveStatus: "too_large" } };
export const ReportUnavailable: Story = {
  args: { ...retainedArgs, reportSaveStatus: "unavailable" },
};
export const Spanish: Story = {
  play,
  parameters: { locale: "es-ES" },
  args: { resultColumns: columns(3) },
};
export const Japanese: Story = {
  play,
  parameters: { locale: "ja" },
  args: { resultColumns: columns(3) },
};
export const Polish: Story = {
  play,
  parameters: { locale: "pl" },
  args: { resultColumns: columns(3) },
};
