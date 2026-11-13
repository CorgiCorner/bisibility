import type { Meta, StoryObj } from "@storybook/react";
import { SeoCostCard } from "./SeoCostCard";

const meta = {
  component: SeoCostCard,
  title: "Dashboard/SEO cost",
} satisfies Meta<typeof SeoCostCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  args: {
    model: {
      kind: "ready",
      month: "2026-11",
      tiles: {
        custom: [],
        provider: [{ currency: "USD", minor: 0 }],
        seo: [{ currency: "USD", minor: 6200 }],
        subscriptions: [{ currency: "USD", minor: 6200 }],
      },
    },
    projectRef: "prj_story",
  },
};
