import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";
import { NewRuleDrawer } from "./NewRuleDrawer";

const projectId = "prj_abcdefghijklmnopqrstuvwx";

const meta = {
  component: NewRuleDrawer,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  title: "Alerts/New rule drawer",
} satisfies Meta<typeof NewRuleDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MarketScope: Story = {
  args: {
    actions: {
      createAlertRuleAction: fn(async () => ({ id: "alr_abcdefghijklmnopqrstuvwx" })),
      deleteWebhookEndpointAction: fn(async () => ({ deleted: true })),
      testWebhookEndpointAction: fn(async () => ({ ok: true })),
      updateAlertRuleAction: fn(async () => ({ id: "alr_abcdefghijklmnopqrstuvwx" })),
      upsertWebhookEndpointAction: fn(async () => ({ id: "we_abcdefghijklmnopqrstuvwx" })),
    },
    canManageEndpoints: true,
    onClose: fn(),
    open: true,
    projectDomain: "example.com",
    projectId,
    targets: {
      keywords: [{ id: "kw_abcdefghijklmnopqrstuvwx", label: "rank tracker" }],
      markets: [
        {
          canonicalKey: "ES",
          id: "pmkt_abcdefghijklmnopqrstuvwx",
          label: "Spain / Spanish",
        },
        {
          canonicalKey: "ES@en",
          id: "pmkt_b00000000000000000000000",
          label: "Spain / English",
        },
        {
          canonicalKey: "BE",
          id: "pmkt_c00000000000000000000000",
          label: "Belgium / Dutch",
        },
        {
          canonicalKey: "BE@ar",
          id: "pmkt_d00000000000000000000000",
          label: "Belgium / Arabic",
        },
      ],
      members: [],
      tags: [],
      webhookEndpoints: [],
    },
  },
  render: (args) => (
    <main className="min-h-[760px] bg-bg text-fg">
      <NewRuleDrawer {...args} />
    </main>
  ),
};
