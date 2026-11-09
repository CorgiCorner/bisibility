import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import general from "@/messages/core/pl/project-settings-general.json";
import shared from "@/messages/core/pl/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { DomainVerificationCard } from "./DomainVerificationCard";

const meta = {
  title: "Settings/Domain verification",
  component: DomainVerificationCard,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="pl"
        timeZone="UTC"
        messages={mergeMessageCatalogs(general, shared)}
      >
        <div className="min-h-screen bg-bg p-4 text-fg">
          <div className="max-w-[640px]">
            <Story />
          </div>
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { nextjs: { appDirectory: true }, layout: "fullscreen" },
} satisfies Meta<typeof DomainVerificationCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const DnsChallenge: Story = {
  args: {
    projectId: "prj_abcdefghijklmnopqrstuvwx",
    canEdit: true,
    initial: {
      domain: "example.com",
      method: "dns_txt",
      dns_host: "_bisibility.example.com",
      dns_value:
        "bisibility-site-verification=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRST",
      verified_at: null,
      last_checked_at: null,
      last_check_result: null,
      failures: 0,
      revoked_at: null,
    },
  },
};
