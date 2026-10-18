import AlertsLoading from "@/app/(regional)/app/(workspace)/[project]/alerts/loading";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import alertsMessages from "@/messages/core/en/project-alerts.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";
import { AlertsPageContent } from "./AlertsPageContent";
import { makeAlertRule } from "./AlertsPageContent.fixtures";

const meta = {
  title: "Alerts/Workspace",
  component: AlertsPageContent,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={{ ...sharedMessages, ...alertsMessages }}
        timeZone="UTC"
      >
        <div className="min-h-screen bg-bg p-6 text-fg">
          <PageContent>
            <Story />
          </PageContent>
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  args: {
    actions: {
      createAlertRuleAction: fn(async () => ({})),
      deleteAlertRuleAction: fn(async () => ({})),
      deleteWebhookEndpointAction: fn(async () => ({})),
      setAlertRuleEnabledAction: fn(async () => ({})),
      testWebhookEndpointAction: fn(async () => ({})),
      upsertWebhookEndpointAction: fn(async () => ({})),
      updateAlertRuleAction: fn(async () => ({})),
    },
    alerts: [],
    canCreate: true,
    canDelete: true,
    canManage: true,
    canReadAudit: true,
    canUpdate: true,
    facetOptions: { market: [{ label: "Poland", value: "pl" }] },
    facets: [],
    firedInWindowCount: 0,
    gscConnected: false,
    gscInstallHref: "/app/prj_fixture/integrations",
    hasTrackedKeywords: true,
    projectDomain: "example.com",
    projectId: "prj_fixture",
    projectRef: "prj_fixture",
    rules: [makeAlertRule()],
    snoozedInWindowCount: 0,
    targets: { keywords: [], markets: [], members: [], tags: [] },
    templates: [],
  },
} satisfies Meta<typeof AlertsPageContent>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const Loading: Story = { render: () => <AlertsLoading /> };
