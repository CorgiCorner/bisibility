import { docsLinkProps } from "@/lib/site/site";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react";
import { InlineCallout, InlineCode } from "./InlineCallout";

const meta = {
  title: "UI/InlineCallout",
  component: InlineCallout,
  decorators: [
    (Story) => (
      <div className="max-w-[560px] bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InlineCallout>;

export default meta;

type Story = StoryObj<typeof meta>;

export const PlainText: Story = {
  args: {
    children: "Search Console OAuth is not configured on this instance.",
    tint: "yellow",
  },
};

export const RedTint: Story = {
  args: {
    children: (
      <>
        <span className="font-semibold text-fg">Stored credentials can&apos;t be read.</span>{" "}
        Reconnect the provider.
      </>
    ),
    tint: "red",
  },
};

export const EnvCodeChips: Story = {
  args: {
    children: (
      <>
        Set <InlineCode>GOOGLE_CLIENT_ID</InlineCode> and{" "}
        <InlineCode>GOOGLE_CLIENT_SECRET</InlineCode> to enable this integration.
      </>
    ),
    tint: "yellow",
  },
};

// The exact GSC OAuth composition used in the onboarding connect-data step:
// env-var code chips plus an external link carrying the arrow-up-right icon.
export const GscOAuth: Story = {
  args: {
    children: (
      <>
        Search Console OAuth is not configured on this instance. Set{" "}
        <InlineCode>GOOGLE_CLIENT_ID</InlineCode> and <InlineCode>GOOGLE_CLIENT_SECRET</InlineCode>.
        See the{" "}
        <a
          className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline"
          href="/docs/integrations#analytics-sources"
          {...docsLinkProps("/docs/integrations#analytics-sources")}
        >
          setup guide
          <ArrowUpRight aria-hidden size={13} weight="bold" />
        </a>{" "}
        for how to create them.
      </>
    ),
    tint: "yellow",
  },
};
