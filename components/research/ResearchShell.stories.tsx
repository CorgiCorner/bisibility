import { AiResearchWorkspace } from "@/components/ai-research/AiResearchWorkspace";
import {
  aiResearchCatalogFixture,
  fixtureChargedFailure,
  fixtureCredentialRotationAction,
  fixtureResearchAction,
  fixtureUnknownCostAction,
} from "@/components/ai-research/ai-research-fixtures";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { AppFooter } from "@/components/shell/AppFooter";
import { AppHeaderFrame } from "@/components/shell/AppHeaderFrame";
import { AppThemeRoot } from "@/components/shell/AppThemeRoot";
import { CommandPaletteProvider } from "@/components/shell/CommandPalette";
import { NotificationBellClient } from "@/components/shell/NotificationBellClient";
import { Sidebar } from "@/components/shell/Sidebar";
import { SiteAuditWorkspace } from "@/components/site-audit/SiteAuditWorkspace";
import { auditFixture, failedAuditFixture } from "@/components/site-audit/story-fixtures";
import type { WorkspaceSummary } from "@/lib/queries/workspaces";
import { AppRealtimeContext } from "@/lib/realtime/useAppRealtime";
import aiMessages from "@/messages/core/en/project-ai-research.json";
import auditMessages from "@/messages/core/en/project-site-audit.json";
import sharedMessages from "@/messages/core/en/shared.json";
import shellMessages from "@/messages/core/en/shell.json";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

const projectId = "prj_example";
const workspaces: WorkspaceSummary[] = [
  {
    id: "project_example",
    publicId: projectId,
    name: "Example",
    domain: "example.com",
    isDefault: true,
    isSample: false,
    keywordCount: 0,
    latestCompletedRankCheckAt: null,
    onboardingCompletedAt: new Date("2026-10-02"),
    plan: "free",
    role: "owner",
    state: "no-data",
    writeMode: "active",
  },
];
const feed = { items: [], unreadCount: 0 };
const noop = async () => ({ updated: 0 });

export function ResearchShell({
  module = "audit",
  failed = false,
  catalogUnavailable = false,
  unknownCost = false,
  credentialRotation = false,
  chargedFailure = false,
}: {
  module?: "audit" | "visibility" | "prompt";
  failed?: boolean;
  catalogUnavailable?: boolean;
  unknownCost?: boolean;
  credentialRotation?: boolean;
  chargedFailure?: boolean;
}) {
  return (
    <FeatureMessagesProvider
      locale="en"
      timeZone="UTC"
      messages={{ ...sharedMessages, ...shellMessages, ...aiMessages, ...auditMessages }}
    >
      <AppRealtimeContext.Provider value={{ notifications: null, operations: [], status: "live" }}>
        <AppThemeRoot
          defaultTheme="light"
          data-shell-root
          className="min-h-dvh bg-bg text-fg lg:grid lg:grid-cols-[270px_minmax(0,1fr)] lg:[--app-sidebar-width:270px] data-[collapsed=true]:lg:grid-cols-[80px_minmax(0,1fr)] data-[collapsed=true]:lg:[--app-sidebar-width:80px]"
        >
          <CommandPaletteProvider projectId={projectId} projectRef={projectId}>
            <Sidebar
              activeProjectId={projectId}
              canCreateWorkspace={false}
              projectRef={projectId}
              workspaces={workspaces}
              version="0.28.0"
            />
            <div className="flex min-w-0 flex-col">
              <AppHeaderFrame
                activeProjectId={projectId}
                canCreateWorkspace={false}
                projectRef={projectId}
                workspaces={workspaces}
                notificationControl={
                  <NotificationBellClient
                    feed={feed}
                    projectRef={projectId}
                    markAllNotificationsRead={noop}
                    markNotificationRead={noop}
                    refreshNotificationFeed={async () => feed}
                  />
                }
                user={{
                  email: "member@example.com",
                  name: "Example member",
                  roleLine: "Owner in Example",
                  theme: "light",
                }}
              />
              <main className="min-w-0 flex-1 px-4 py-4 sm:px-5 lg:px-7 lg:py-5.5">
                {module === "audit" ? (
                  <SiteAuditWorkspace
                    domain="example.com"
                    projectId={projectId}
                    canRun
                    initial={failed ? failedAuditFixture : null}
                    history={[]}
                    runAction={async () => auditFixture}
                    readAction={async () => auditFixture}
                  />
                ) : (
                  <AiResearchWorkspace
                    catalog={catalogUnavailable ? undefined : aiResearchCatalogFixture}
                    catalogError={catalogUnavailable ? "Fixture catalog unavailable" : undefined}
                    projectId={projectId}
                    domain="example.com"
                    mode={module}
                    history={[]}
                    initialOutcome={chargedFailure ? fixtureChargedFailure : undefined}
                    analyzeAction={
                      credentialRotation
                        ? fixtureCredentialRotationAction
                        : unknownCost
                          ? fixtureUnknownCostAction
                          : fixtureResearchAction
                    }
                  />
                )}
              </main>
              <AppFooter showInstanceAdmin />
            </div>
          </CommandPaletteProvider>
        </AppThemeRoot>
      </AppRealtimeContext.Provider>
    </FeatureMessagesProvider>
  );
}
const meta = {
  title: "Research/Shared shell",
  component: ResearchShell,
  parameters: { layout: "fullscreen", themeControls: false, nextjs: { appDirectory: true } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole("heading", { level: 1 })).toHaveLength(1);
  },
} satisfies Meta<typeof ResearchShell>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SiteAudit: Story = {
  parameters: { nextjs: { navigation: { pathname: `/app/${projectId}/site-audit` } } },
};
export const FailedAudit: Story = { args: { failed: true }, parameters: SiteAudit.parameters };
export const Visibility: Story = {
  args: { module: "visibility" },
  parameters: { nextjs: { navigation: { pathname: `/app/${projectId}/ai-visibility` } } },
};
export const PromptExplorer: Story = {
  args: { module: "prompt" },
  parameters: { nextjs: { navigation: { pathname: `/app/${projectId}/prompt-explorer` } } },
};

export const LegacyPromptCatalogOutage: Story = {
  args: { module: "prompt", catalogUnavailable: true },
  parameters: PromptExplorer.parameters,
};
export const LegacyVisibilityCatalogOutage: Story = {
  args: { module: "visibility", catalogUnavailable: true },
  parameters: Visibility.parameters,
};

export const ActualCostUnknownReceipt: Story = {
  args: { module: "prompt", unknownCost: true },
  parameters: PromptExplorer.parameters,
};

export const ActualCostCredentialRotation: Story = {
  args: { module: "prompt", credentialRotation: true },
  parameters: PromptExplorer.parameters,
};

export const ChargedProviderFailure: Story = {
  args: { module: "prompt", chargedFailure: true },
  parameters: PromptExplorer.parameters,
};
