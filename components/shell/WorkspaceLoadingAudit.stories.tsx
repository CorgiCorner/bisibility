import { GettingStartedChecklist } from "@/components/getting-started/GettingStartedChecklist";
import { GettingStartedHeaderProgress } from "@/components/getting-started/GettingStartedHeaderProgress";
import { GettingStartedLoading } from "@/components/getting-started/GettingStartedLoading";
import { setupProgressSummary } from "@/components/getting-started/getting-started-header-progress";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import { TimelineFeed } from "@/components/timeline/TimelineFeed";
import { TimelineLoading } from "@/components/timeline/TimelineLoading";
import {
  gettingStartedFeatureTestMessages,
  shellFeatureTestMessages,
  timelineFeatureTestMessages,
} from "@/i18n/test-support/feature-test-messages";
import { resolveSetupProgress, type SetupContext } from "@/lib/getting-started/setup-steps";
import type { TimelineSignalRow } from "@/lib/queries/timeline";
import { AppRealtimeContext } from "@/lib/realtime/useAppRealtime";
import type { Meta, StoryObj } from "@storybook/react";
import { AppHeaderFrame } from "./AppHeaderFrame";
import { CommandPaletteProvider } from "./CommandPalette";
import { ShellSkeleton } from "./ShellSkeleton";
import { Sidebar } from "./Sidebar";
import { SidebarCollapsedProvider } from "./SidebarCollapsedState";
import { mockWorkspaces } from "./workspaces.mock";

const context: SetupContext = {
  completedCheckCount: 0,
  competitorSetupOutcome: null,
  competitorSuggestions: [],
  inFlightBatch: null,
  keywordCount: 0,
  keywordIds: [],
  project: {
    exists: true,
    name: "acme.dev",
    publicRef: mockWorkspaces[0].publicId as SetupContext["project"]["publicRef"],
  },
  providerExists: false,
  schedule: { mode: "manual" },
};
const timelineRows: TimelineSignalRow[] = Array.from({ length: 6 }, (_, index) => ({
  id: `signal_${index}`,
  publicId: `sig_story_${index}`,
  projectId: "project_story",
  createdAt: new Date("2026-10-01T10:30:00Z"),
  happenedAt: new Date(index < 3 ? "2026-10-01T10:30:00Z" : "2026-09-30T10:30:00Z"),
  createdBy: { name: "Member", email: "member@example.test" },
  createdById: "user_story",
  keyword: null,
  keywordId: null,
  payload: { note: "Launch annotation" },
  severity: "info",
  source: "manual",
  type: "note",
  url: null,
}));
const noop = () => undefined;
const actions = {
  addManualCompetitor: async () => ({ ok: false as const, reason: "write_failed" as const }),
  confirmSuggestedCompetitor: async () => ({ ok: false as const, reason: "write_failed" as const }),
  dismissCompetitorSuggestion: async () => ({
    ok: false as const,
    reason: "write_failed" as const,
  }),
  skipCompetitorSetup: async () => ({ ok: false as const, reason: "write_failed" as const }),
};
const messages = {
  ...shellFeatureTestMessages,
  ...gettingStartedFeatureTestMessages,
  ...timelineFeatureTestMessages,
};
function WorkspaceLoadingAudit({
  route,
  loading = false,
  collapsed = false,
}: Readonly<{
  route: "shell" | "getting-started" | "timeline";
  loading?: boolean;
  collapsed?: boolean;
}>) {
  const content = <div className="h-60 rounded-card border border-border bg-bg-elev" />;
  const workspace = mockWorkspaces[0];
  const shellProps = {
    activeProjectId: workspace.id,
    projectRef: workspace.publicId,
    workspaces: mockWorkspaces,
    canCreateWorkspace: false,
    version: "0.34",
  };
  return (
    <FeatureMessagesProvider locale="en" timeZone="UTC" messages={messages}>
      <div
        className="min-h-screen bg-bg text-fg"
        data-workspace-audit={route}
        data-phase={loading ? "loading" : "ready"}
      >
        {route === "shell" ? (
          loading ? (
            <ShellSkeleton collapsed={collapsed}>{content}</ShellSkeleton>
          ) : (
            <SidebarCollapsedProvider defaultCollapsed={collapsed}>
              <CommandPaletteProvider projectId={workspace.id} projectRef={workspace.publicId}>
                <AppRealtimeContext.Provider
                  value={{ notifications: null, operations: [], status: "live" }}
                >
                  <div
                    className={`min-h-dvh bg-bg lg:grid ${collapsed ? "lg:grid-cols-[80px_minmax(0,1fr)]" : "lg:grid-cols-[270px_minmax(0,1fr)]"}`}
                  >
                    <Sidebar {...shellProps} />
                    <div className="flex min-w-0 flex-col">
                      <AppHeaderFrame
                        {...shellProps}
                        user={{ name: "Example user" }}
                        notificationControl={<span className="size-8" />}
                      />
                      <div className="min-w-0 flex-1 px-4 py-4 sm:px-5 lg:px-7 lg:py-5.5">
                        {content}
                      </div>
                    </div>
                  </div>
                </AppRealtimeContext.Provider>
              </CommandPaletteProvider>
            </SidebarCollapsedProvider>
          )
        ) : (
          <div className="p-4 sm:p-6">
            {route === "getting-started" ? (
              loading ? (
                <GettingStartedLoading />
              ) : (
                <PageContent variant="constrained" className="grid gap-5">
                  <GettingStartedHeaderProgress
                    completionMode="state-a"
                    progress={setupProgressSummary(resolveSetupProgress(context))}
                    projectRef={workspace.publicId}
                  />
                  <GettingStartedChecklist
                    competitorActions={actions}
                    context={context}
                    now={new Date("2026-10-01T12:00:00Z")}
                    onCta={noop}
                  />
                </PageContent>
              )
            ) : loading ? (
              <TimelineLoading />
            ) : (
              <PageContent>
                <TimelineFeed
                  canCreate
                  canDelete
                  dateDisplay={{ dateFormat: "day_first", locale: "en", timeZone: "UTC" }}
                  projectId="prj_story"
                  projectRef="prj_story"
                  view={{
                    filter: "all",
                    hasNextPage: false,
                    hasPreviousPage: false,
                    isFiltered: false,
                    now: new Date("2026-10-01T12:00:00Z"),
                    page: 1,
                    rows: timelineRows,
                    search: "",
                    timeZone: "UTC",
                  }}
                />
              </PageContent>
            )}
          </div>
        )}
      </div>
    </FeatureMessagesProvider>
  );
}
const meta = {
  title: "Loading audit/Workspace",
  component: WorkspaceLoadingAudit,
  parameters: {
    layout: "fullscreen",
    themeControls: false,
    nextjs: { appDirectory: true, navigation: { pathname: "/app/prj_story/dashboard" } },
  },
} satisfies Meta<typeof WorkspaceLoadingAudit>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ShellReady: Story = { args: { route: "shell" } };
export const ShellLoading: Story = { args: { route: "shell", loading: true } };
export const ShellCollapsedReady: Story = { args: { route: "shell", collapsed: true } };
export const ShellCollapsedLoading: Story = {
  args: { route: "shell", collapsed: true, loading: true },
};
export const GettingStartedReady: Story = { args: { route: "getting-started" } };
export const GettingStartedLoadingState: Story = {
  args: { route: "getting-started", loading: true },
};
export const TimelineReady: Story = { args: { route: "timeline" } };
export const TimelineLoadingState: Story = { args: { route: "timeline", loading: true } };
