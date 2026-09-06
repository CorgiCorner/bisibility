import { HeaderProviderSpend } from "@/components/cost-estimate/HeaderProviderSpend";
import { NotificationBellClient } from "@/lib/notifications/NotificationBellClient";
import type { NotificationFeed } from "@/lib/queries/notifications";
import type { OperationSnapshot } from "@/lib/rank-check/runs/contract";
import { AppRealtimeContext, type AppRealtimeValue } from "@/lib/realtime/useAppRealtime";
import type { Meta, StoryObj } from "@storybook/react";
import { AppHeaderFrame } from "./AppHeaderFrame";

const notificationFeed = { items: [], unreadCount: 0 } satisfies NotificationFeed;

const rankCheck = {
  blockedReason: null,
  costCents: 0,
  counts: {
    cancelled: 0,
    completed: 126,
    deferred: 0,
    failed: 2,
    requested: 700,
    skipped: 0,
    total: 700,
  },
  estimatedCostCents: 0,
  finishedAt: null,
  id: "rcr_story",
  keywordCount: 350,
  kind: "rank_check",
  outcome: null,
  parentRunId: null,
  nextCheckAt: null,
  plannedFor: null,
  provider: "serpapi",
  providerLabel: "SerpApi",
  selectionKind: "filter",
  startedAt: "2026-09-03T12:00:00.000Z",
  status: "running",
  targetCount: 700,
  trigger: "manual",
} satisfies OperationSnapshot;

type HeaderStoryProps = {
  operations?: OperationSnapshot[];
  spend: "capped" | "unavailable" | "without-cap";
  status?: AppRealtimeValue["status"];
  theme?: "dark" | "light";
  trayOpen?: boolean;
};

function HeaderStory({
  operations = [],
  spend,
  status = "live",
  theme = "light",
  trayOpen = false,
}: Readonly<HeaderStoryProps>) {
  const action = spend === "unavailable" ? undefined : "details";
  const recorded = spend === "unavailable" ? null : { cents: 3100, units: 1240 };
  const tightest = spend === "without-cap" ? null : { provider: "DataForSEO", usedPercent: 62 };
  const usedPercent = spend === "without-cap" ? null : 62;

  return (
    <AppRealtimeContext.Provider value={{ notifications: null, operations, status }}>
      <div className="min-h-24 bg-bg text-fg" data-theme={theme}>
        <AppHeaderFrame
          actions={
            <HeaderProviderSpend
              action={action}
              projectRef="prj_story"
              recorded={recorded}
              tightest={tightest}
              usedPercent={usedPercent}
            />
          }
          activeProjectId="prj_story"
          canCreateWorkspace={false}
          notificationControl={
            <NotificationBellClient
              feed={notificationFeed}
              markAllNotificationsRead={async () => ({ updated: 0 })}
              markNotificationRead={async () => ({ updated: 0 })}
              projectRef="prj_story"
              refreshNotificationFeed={async () => notificationFeed}
            />
          }
          operationsTrayDefaultOpen={trayOpen}
          projectRef="prj_story"
          workspaces={[]}
        />
      </div>
    </AppRealtimeContext.Provider>
  );
}

const meta = {
  title: "Components/AppHeader",
  component: HeaderStory,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof HeaderStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { spend: "capped" },
  name: "default",
};

export const ShowlivepillTrue: Story = {
  args: { spend: "capped" },
  name: "showlivepill-true",
};

export const SpendhascapFalse: Story = {
  args: { spend: "without-cap" },
  name: "spendhascap-false",
};

export const SpendunavailableTrue: Story = {
  args: { spend: "unavailable" },
  name: "spendunavailable-true",
};

export const ThemeDark: Story = {
  args: { spend: "capped", theme: "dark" },
  name: "theme-dark",
};

export const TrayOpen: Story = {
  args: { operations: [rankCheck], spend: "capped", trayOpen: true },
  name: "tray-open",
};
