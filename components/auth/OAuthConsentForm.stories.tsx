import { OAuthConsentForm } from "@/components/auth/OAuthConsentForm";
import { BrandLockup } from "@/components/ui/BrandLockup";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  component: OAuthConsentForm,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-bg-sunken px-4 py-8 text-fg sm:px-6">
        <div className="mb-7">
          <BrandLockup />
        </div>
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
      name: "ChatGPT",
      redirectUri: "chatgpt.com/connector/oauth/callback",
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

export const ReadOnly: Story = {
  ...DynamicClient,
  args: { ...DynamicClient.args, scopes: ["openid", "email", "read"] },
};

export const LongAppName: Story = {
  ...DynamicClient,
  args: {
    ...DynamicClient.args,
    client: {
      dynamic: true,
      id: "long-client",
      name: "A very long application name that should still fit on a small phone screen",
      redirectUri: "example.com/callback",
    },
  },
};
