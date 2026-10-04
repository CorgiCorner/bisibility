import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import aiMessages from "@/messages/core/en/project-ai-research.json";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AiResearchResults } from "./AiResearchResults";

const meta = {
  title: "Research/AI Results",
  component: AiResearchResults,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider locale="en" timeZone="UTC" messages={aiMessages}>
        <Story />
      </FeatureMessagesProvider>
    ),
  ],
} satisfies Meta<typeof AiResearchResults>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Observed: Story = {
  args: {
    result: {
      evidence: "observed_dataset",
      fetchedAt: "2026-10-02T12:00:00Z",
      costCents: 10.1,
      costStatus: "confirmed",
      failure: null,
      totalAvailable: 24,
      truncated: true,
      rows: [
        {
          prompt: "What tools help a small team track search visibility?",
          model: "google_ai_overview",
          answer:
            "Acme helps small teams monitor search rankings and identify pages that need attention.",
          observedAt: "2026-10-01",
          brandMentioned: true,
          domainCited: true,
          citations: [
            {
              title: "Acme - Search visibility for small teams",
              url: "https://acme.example/product",
              targetDomain: true,
            },
          ],
        },
      ],
    },
  },
};
export const Synthetic: Story = {
  args: {
    result: {
      ...Observed.args.result,
      evidence: "synthetic_prompt_test",
      costCents: 0.11,
      totalAvailable: null,
      truncated: false,
      rows: [
        {
          ...Observed.args.result.rows[0],
          model: "gpt-4.1-mini",
          citations: [],
          domainCited: false,
        },
        {
          ...Observed.args.result.rows[0],
          model: "gpt-4.1-nano",
          answer: "Consider a rank tracker with a clear workflow and a predictable budget.",
          citations: [],
          domainCited: false,
          brandMentioned: false,
        },
      ],
    },
  },
};
export const Empty: Story = {
  args: { result: { ...Observed.args.result, rows: [], totalAvailable: 0, truncated: false } },
};
export const UsageUncertain: Story = {
  args: {
    result: {
      ...Synthetic.args.result,
      rows: Synthetic.args.result.rows.slice(0, 1),
      failure: "Request interrupted",
      costStatus: "unknown",
      truncated: true,
    },
  },
};
