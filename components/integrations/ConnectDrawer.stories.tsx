import { ConnectDrawer } from "@/components/integrations/ConnectDrawer";
import { integrationCategories } from "@/components/integrations/integrations-fixtures";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Integrations/ConnectDrawer",
  component: ConnectDrawer,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ConnectDrawer>;

export default meta;

type Story = StoryObj<typeof meta>;

const serpProviders = integrationCategories[0].providers;
const analyticsProviders = integrationCategories[1].providers;
const connectedGsc = {
  ...analyticsProviders[0],
  drawer: {
    ...analyticsProviders[0].drawer,
    defaults: {
      ...analyticsProviders[0].drawer.defaults,
      login: "sc-domain:example.com",
    },
  },
};
const readyGsc = {
  ...connectedGsc,
  drawer: {
    ...connectedGsc.drawer,
    defaults: { ...connectedGsc.drawer.defaults, login: "" },
  },
  secondaryAction: undefined,
  status: "ready" as const,
};
const selectingGscProperty = {
  ...readyGsc,
  drawer: {
    ...readyGsc.drawer,
    googleOAuth: {
      properties: [
        {
          kind: "domain" as const,
          label: "example.com (Domain property)",
          permissionLevel: "siteOwner",
          value: "sc-domain:example.com",
        },
        {
          kind: "url-prefix" as const,
          label: "https://example.com/ (URL-prefix property)",
          permissionLevel: "siteFullUser",
          value: "https://example.com/",
        },
      ],
    },
  },
};
const selectingGa4Property = {
  ...analyticsProviders[1],
  drawer: {
    ...analyticsProviders[1].drawer,
    googleOAuth: {
      properties: [
        {
          kind: "ga4" as const,
          label: "Bisibility (123456789)",
          permissionLevel: "CorgiCorner",
          value: "123456789",
        },
        {
          kind: "ga4" as const,
          label: "Example (987654321)",
          permissionLevel: "CorgiCorner",
          value: "987654321",
        },
      ],
      provider: "ga4" as const,
    },
  },
};
const enteringGa4Property = {
  ...analyticsProviders[1],
  drawer: {
    ...analyticsProviders[1].drawer,
    googleOAuth: {
      error: "We couldn't load GA4 properties from this Google account.",
      properties: [],
      provider: "ga4" as const,
    },
  },
};

export const DataForSeo: Story = {
  args: {
    onClose: () => undefined,
    open: true,
    provider: serpProviders[0],
  },
  render: (args) => (
    <div className="min-h-[720px] bg-bg text-fg">
      <ConnectDrawer {...args} />
    </div>
  ),
};

export const Analytics: Story = {
  ...DataForSeo,
  args: {
    onClose: () => undefined,
    open: true,
    provider: connectedGsc,
  },
};

export const ConnectGoogleAccount: Story = {
  ...DataForSeo,
  args: {
    onClose: () => undefined,
    open: true,
    provider: readyGsc,
  },
};

export const SelectSearchConsoleProperty: Story = {
  ...DataForSeo,
  args: {
    onClose: () => undefined,
    open: true,
    provider: selectingGscProperty,
  },
};

export const SelectAnalyticsProperty: Story = {
  ...DataForSeo,
  args: {
    onClose: () => undefined,
    open: true,
    provider: selectingGa4Property,
  },
};

export const EnterAnalyticsProperty: Story = {
  ...DataForSeo,
  args: {
    onClose: () => undefined,
    open: true,
    provider: enteringGa4Property,
  },
};

export const Plausible: Story = {
  ...DataForSeo,
  args: {
    onClose: () => undefined,
    open: true,
    provider: analyticsProviders[2],
  },
};
