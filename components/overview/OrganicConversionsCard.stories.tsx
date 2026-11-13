import type { Meta, StoryObj } from "@storybook/react";
import { OrganicConversionsCard } from "./OrganicConversionsCard";

const meta = {
  component: OrganicConversionsCard,
  title: "Dashboard/Organic conversions",
} satisfies Meta<typeof OrganicConversionsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const projectRef = "prj_story";

export const Ready: Story = {
  args: {
    markers: [],
    model: {
      current: 18,
      goalCount: 2,
      kind: "ready",
      pages: [
        { conversions: 11, path: "/pricing" },
        { conversions: 7, path: "/docs" },
      ],
      previous: 12,
      selection: {
        connect: false,
        options: [
          { connected: true, hasData: true, label: "GA4", primary: true, source: "ga4" },
          {
            connected: true,
            hasData: true,
            label: "Plausible",
            primary: false,
            source: "plausible",
          },
        ],
        selected: "ga4",
        showSwitch: true,
      },
      series: [
        { date: "2026-11-09", totalCount: 2 },
        { date: "2026-11-10", totalCount: 4 },
      ],
      source: "ga4",
      sourceLabel: "GA4",
    },
    projectRef,
  },
};

export const Connect: Story = {
  args: { markers: [], model: { kind: "connect" }, projectRef },
};
