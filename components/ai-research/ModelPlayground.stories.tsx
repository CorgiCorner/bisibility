import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import { aiResearchCatalogFixture } from "@/components/ai-research/ai-research-fixtures";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type { AiResearchOutcome } from "@/lib/ai-research/service";
import aiMessages from "@/messages/core/en/project-ai-research.json";
import trackingMessages from "@/messages/core/en/project-ai-tracking.json";
import historyMessages from "@/messages/core/en/research-history.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ModelPlayground } from "./ModelPlayground";

const quote = paymentQuote();
const payment = {
  actionId: quote.id,
  charge: quote.charge,
  option: { ...quote.option, fundingSource: "platform" as const },
  quoteId: quote.id,
  state: "settled" as const,
};
const entities = [
  {
    aliases: [],
    domain: "acme.example.com",
    excludedNames: [],
    id: "prj_acme",
    kind: "project" as const,
    label: "Acme",
  },
  {
    aliases: [],
    domain: "northwind.example.org",
    excludedNames: [],
    id: "cmp_northwind",
    kind: "competitor" as const,
    label: "Northwind",
  },
];
const engineOptions = [
  { engine: "chat_gpt" as const, model: "gpt-4.1-mini" },
  { engine: "claude" as const, model: "claude-example" },
  { engine: "gemini" as const, model: "gemini-example" },
];
const compared: AiResearchOutcome = {
  cached: false,
  costCents: 12,
  estimate: false,
  ok: true,
  payment,
  reportId: "agr_abcdefghijklmnopqrstuvwx",
  result: {
    costCents: 12,
    costStatus: "confirmed",
    evidence: "synthetic_prompt_test",
    failure: "Gemini did not answer.",
    fetchedAt: "2026-11-10T12:00:02Z",
    rows: [
      {
        answer: "Acme is the first place to look.",
        brandMentioned: true,
        citations: [
          {
            targetDomain: true,
            title: "Acme docs",
            url: "https://acme.example.com/docs",
          },
        ],
        domainCited: true,
        engine: "chat_gpt",
        model: "gpt-4.1-mini",
        observedAt: "2026-11-10T12:00:00Z",
        prompt: "Which directory should a team start with?",
      },
      {
        answer: "Northwind publishes a directory.",
        brandMentioned: false,
        citations: [
          {
            targetDomain: false,
            title: "Northwind",
            url: "https://northwind.example.org/list",
          },
        ],
        domainCited: false,
        engine: "claude",
        model: "claude-example",
        observedAt: "2026-11-10T12:00:01Z",
        prompt: "Which directory should a team start with?",
      },
    ],
    totalAvailable: null,
    truncated: true,
  },
};

const meta = {
  title: "Research/Model Playground",
  component: ModelPlayground,
  args: {
    canRun: true,
    canTrack: true,
    catalog: aiResearchCatalogFixture,
    domain: "acme.example.com",
    engineOptions,
    entities,
    projectId: "prj_example",
    projectName: "Acme",
    selectedEngines: ["chat_gpt", "claude", "gemini"],
    sourceOverrides: [],
    topics: [{ id: "topic_example", name: "Directories" }],
  },
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={{ ...sharedMessages, ...aiMessages, ...trackingMessages, ...historyMessages }}
        timeZone="UTC"
      >
        <Story />
      </FeatureMessagesProvider>
    ),
  ],
} satisfies Meta<typeof ModelPlayground>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ThreeColumns: Story = { args: { initialOutcome: compared } };
export const Connected: Story = { args: { catalog: aiResearchCatalogFixture, engineOptions } };
export const Empty: Story = {};
export const NoProvider: Story = {
  args: {
    catalog: undefined,
    catalogFailure: "no_source",
    engineOptions: [],
    selectedEngines: undefined,
    supportingProviders: ["DataForSEO"],
  },
};

export const TabletComposer: Story = {
  globals: { viewport: { value: "tablet", isRotated: false } },
};
export const LegacyComposer: Story = { args: { engineOptions: [], selectedEngines: undefined } };
