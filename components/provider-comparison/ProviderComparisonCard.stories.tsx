import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import messages from "@/messages/core/en/project-rank-tracker-keyword-detail.json";
import type { Meta, StoryObj } from "@storybook/react";
import { type ComparisonActions, ProviderComparisonCard } from "./ProviderComparisonCard";

const keyword = {
  id: "kw_fixture",
  text: "plumber",
  device: "desktop" as const,
  locationLabel: "Warsaw, Poland",
};
const context = { keyword, providers: [], available: true };
const unavailable = async () => ({ ok: false as const });
const actions: ComparisonActions = {
  load: async () => ({ ok: true, context, run: null }),
  preview: async () => ({
    ok: true,
    preview: {
      id: "fixture-preview",
      hash: "a".repeat(64),
      expiresAt: "2026-10-16T12:00:00Z",
      keyword,
      depth: 20,
      sides: [
        {
          provider: "dataforseo",
          estimatedCostCents: 0.2,
          nativeUnit: "cents",
          nativeQuantity: 0.2,
          fundingSource: "own",
        },
        {
          provider: "serpapi",
          estimatedCostCents: 2,
          nativeUnit: "searches",
          nativeQuantity: 2,
          fundingSource: "own",
        },
      ],
    },
  }),
  launch: async () => ({ ok: false, reason: "unconfirmed" }),
  read: unavailable,
};
const meta = {
  title: "Keywords/Provider comparison",
  component: ProviderComparisonCard,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider locale="en" timeZone="UTC" messages={messages}>
        <div className="mx-auto max-w-4xl p-4">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  args: {
    projectRef: "prj_fixture",
    keywordRef: "kw_fixture",
    canLaunch: true,
    timeZone: "UTC",
    actions,
  },
} satisfies Meta<typeof ProviderComparisonCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const BothProviders: Story = {};
export const OnlyDataForSeo: Story = {
  args: {
    actions: {
      ...actions,
      load: async () => ({ ok: true, context: { ...context, available: false }, run: null }),
    },
  },
};
export const Viewer: Story = { args: { canLaunch: false } };
export const ReadFailure: Story = { args: { actions: { ...actions, load: unavailable } } };
