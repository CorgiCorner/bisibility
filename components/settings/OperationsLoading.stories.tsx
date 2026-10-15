import AlertsLoading from "@/app/(regional)/app/(workspace)/[project]/alerts/loading";
import CompetitorsLoading from "@/app/(regional)/app/(workspace)/[project]/settings/(sections)/competitors/loading";
import AuditLoading from "@/app/(regional)/app/(workspace)/[project]/settings/audit/loading";
import ImportLoading from "@/app/(regional)/app/(workspace)/[project]/settings/import/loading";
import { AccountRouteLoading } from "@/components/account/AccountRouteLoading";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { InstallPageLoading } from "@/components/install/InstallPageLoading";
import { IntegrationsPageLoading } from "@/components/integrations/IntegrationsPageLoading";
import { MarketsPageLoading } from "@/components/markets/page/MarketsPageLoading";
import { ProjectContextLoading } from "@/components/project-context/ProjectContextLayout";
import { ProjectRunsLoading } from "@/components/project-runs/ProjectRunsLoading";
import { RunDetailLoading } from "@/components/rank-runs/RunDetailLoading";
import { SchedulePageLoading } from "@/components/schedules/SchedulePageLoading";
import { AdvancedSettingsLoading } from "@/components/settings/advanced/AdvancedSettingsLoading";
import { BusinessSettingsLoading } from "@/components/settings/BusinessSettingsLoading";
import { DataSourcesSettingsRouteLoading } from "@/components/settings/data-sources/DataSourcesSettingsLoading";
import { DevelopersLoading } from "@/components/settings/developers/DevelopersLoading";
import { ExperimentalSettingsLoading } from "@/components/settings/experimental/ExperimentalSettingsLoading";
import { GeneralSettingsRouteLoading } from "@/components/settings/general/GeneralSettingsLoading";
import { NotificationsRouteLoading } from "@/components/settings/notifications/NotificationsLoading";
import { SettingsRouteLoading } from "@/components/settings/shell/SettingsRouteLoading";
import { TeamSettingsLoading } from "@/components/settings/team/TeamSettingsLoading";
import { TrackingSettingsRouteLoading } from "@/components/settings/tracking/TrackingSettingsLoading";
import { BillingLoading } from "@/components/settings/usage/UsageLoading";
import account from "@/messages/core/en/account.json";
import agentWorkspace from "@/messages/core/en/agent-workspace.json";
import schedules from "@/messages/core/en/project-runs-schedules.json";
import settings from "@/messages/core/en/project-settings-shell.json";
import shared from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";

const screens = {
  markets: <MarketsPageLoading />,
  alerts: <AlertsLoading />,
  runs: <ProjectRunsLoading />,
  schedules: <ProjectRunsLoading active="schedules" />,
  runDetail: <RunDetailLoading />,
  scheduleEditor: <SchedulePageLoading bodyLabel="Schedule editor" breadcrumbLabel="Breadcrumb" />,
  integrations: (
    <IntegrationsPageLoading
      connectionsLabel="Connections"
      usageLabel="Usage"
      active="connections"
    />
  ),
  integrationUsage: (
    <IntegrationsPageLoading connectionsLabel="Connections" usageLabel="Usage" active="usage" />
  ),
  install: <InstallPageLoading isCloudHosted />,
  general: <GeneralSettingsRouteLoading />,
  tracking: <TrackingSettingsRouteLoading />,
  team: <TeamSettingsLoading />,
  notifications: <NotificationsRouteLoading />,
  developers: <DevelopersLoading />,
  dataSources: <DataSourcesSettingsRouteLoading />,
  advanced: <AdvancedSettingsLoading deployment="cloud" />,
  billing: <BillingLoading />,
  competitors: <CompetitorsLoading />,
  experimental: <ExperimentalSettingsLoading />,
  locations: <BusinessSettingsLoading />,
  monitors: <BusinessSettingsLoading view="monitors" />,
  monitor: <BusinessSettingsLoading view="monitor" />,
  context: (
    <SettingsRouteLoading activeSection="context">
      <ProjectContextLoading />
    </SettingsRouteLoading>
  ),
  audit: <AuditLoading />,
  import: <ImportLoading />,
  profile: <AccountRouteLoading />,
  preferences: <AccountRouteLoading active="preferences" />,
  security: <AccountRouteLoading active="security" />,
};
function OperationsLoadingFixture({ view }: { view: keyof typeof screens }) {
  return <div data-operations-loading-fixture={view}>{screens[view]}</div>;
}
const meta = {
  title: "Loading/Operations",
  component: OperationsLoadingFixture,
  args: { view: "markets" },
  argTypes: { view: { control: "select", options: Object.keys(screens) } },
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        timeZone="UTC"
        messages={{ ...shared, ...settings, ...account, ...agentWorkspace, ...schedules }}
      >
        <main className="min-h-screen bg-bg p-4 text-fg sm:p-6">
          <Story />
        </main>
      </FeatureMessagesProvider>
    ),
  ],
} satisfies Meta<typeof OperationsLoadingFixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Markets: Story = {};
export const Alerts: Story = { args: { view: "alerts" } };
export const Runs: Story = { args: { view: "runs" } };
export const Schedules: Story = { args: { view: "schedules" } };
export const RunDetail: Story = { args: { view: "runDetail" } };
export const ScheduleEditor: Story = { args: { view: "scheduleEditor" } };
export const Integrations: Story = { args: { view: "integrations" } };
export const IntegrationUsage: Story = { args: { view: "integrationUsage" } };
export const Install: Story = { args: { view: "install" } };
export const General: Story = { args: { view: "general" } };
export const Tracking: Story = { args: { view: "tracking" } };
export const Team: Story = { args: { view: "team" } };
export const Notifications: Story = { args: { view: "notifications" } };
export const Developers: Story = { args: { view: "developers" } };
export const DataSources: Story = { args: { view: "dataSources" } };
export const Advanced: Story = { args: { view: "advanced" } };
export const Billing: Story = { args: { view: "billing" } };
export const Competitors: Story = { args: { view: "competitors" } };
export const Experimental: Story = { args: { view: "experimental" } };
export const Locations: Story = { args: { view: "locations" } };
export const Monitors: Story = { args: { view: "monitors" } };
export const Monitor: Story = { args: { view: "monitor" } };
export const Context: Story = { args: { view: "context" } };
export const Audit: Story = { args: { view: "audit" } };
export const Import: Story = { args: { view: "import" } };
export const Profile: Story = { args: { view: "profile" } };
export const Preferences: Story = { args: { view: "preferences" } };
export const Security: Story = { args: { view: "security" } };
