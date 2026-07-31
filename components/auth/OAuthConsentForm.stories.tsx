import { OAuthConsentForm } from "@/components/auth/OAuthConsentForm";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  component: OAuthConsentForm,
  decorators: [
    (Story) => (
      <div className="grid min-h-[720px] place-items-center bg-bg-sunken p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  title: "Auth/OAuth Consent",
} satisfies Meta<typeof OAuthConsentForm>;

export default meta;

type Story = StoryObj<typeof meta>;

export const DynamicClient: Story = {
  args: {
    account: { email: "owner@example.com", initials: "OE" },
    client: {
      dynamic: true,
      id: "dUAIRyHbYXXojTidPmdiiaXwmSzXIZjY",
      name: "Codex",
      redirectUri: "127.0.0.1:51008/callback/request",
    },
    expiresAt: Date.now() + 300_000,
    scopes: [
      "openid",
      "profile",
      "email",
      "offline_access",
      "tokens:write",
      "read",
      "write",
      "admin",
    ],
  },
  render: (args) => <OAuthConsentForm {...args} expiresAt={Date.now() + 300_000} />,
};
