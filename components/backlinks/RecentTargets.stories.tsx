import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";
import { RecentTargets } from "./RecentTargets";

const meta = {
  args: { onOpen: fn(), onRemove: fn() },
  component: RecentTargets,
  decorators: [
    (Story) => (
      <div className="min-h-[140px] bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Backlinks/RecentTargets",
} satisfies Meta<typeof RecentTargets>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithCachedBadge: Story = {
  args: {
    targets: [
      {
        cachedUntil: new Date(Date.now() + 22 * 3_600_000).toISOString(),
        fetchedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
        includeSubdomains: true,
        resultLimit: 100,
        target: "acme-store.com",
        targetScope: "site",
      },
    ],
  },
};

export const WithoutCachedBadge: Story = {
  args: {
    targets: [
      {
        cachedUntil: new Date(Date.now() - 3_600_000).toISOString(),
        fetchedAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
        includeSubdomains: false,
        resultLimit: 100,
        target: "https://standly.io/blog/ergonomics",
        targetScope: "page",
      },
    ],
  },
};
