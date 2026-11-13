import type { ConversionReport } from "@/lib/conversions/surface";
import type { Meta, StoryObj } from "@storybook/react";
import { SearchInsightsConversionsCard } from "./SearchInsightsConversionsCard";

const meta = {
  component: SearchInsightsConversionsCard,
  title: "Search Console/Conversions by page",
} satisfies Meta<typeof SearchInsightsConversionsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const ready: ConversionReport = {
  current: 18,
  goalCount: 2,
  kind: "ready",
  pages: [
    { conversions: 11, path: "/pricing", rate: 0.22, sessions: 50 },
    { conversions: 7, path: "/docs", rate: null, sessions: null },
  ],
  previous: 12,
  selection: {
    connect: false,
    options: [
      { connected: true, hasData: true, label: "GA4", primary: true, source: "ga4" },
      { connected: true, hasData: true, label: "Plausible", primary: false, source: "plausible" },
    ],
    selected: "plausible",
    showSwitch: true,
  },
  series: [],
  source: "plausible",
  sourceLabel: "Plausible",
};

export const ByPage: Story = {
  args: { projectId: "prj_story", report: ready },
};

export const Connect: Story = {
  args: {
    projectId: "prj_story",
    report: {
      kind: "connect",
      selection: { connect: true, options: [], selected: null, showSwitch: false },
    },
  },
};
