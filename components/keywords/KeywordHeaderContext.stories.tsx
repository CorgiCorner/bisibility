import { AppHeaderFrame } from "@/components/shell/AppHeaderFrame";
import { NotificationBellClient } from "@/components/shell/NotificationBellClient";
import { ToastProvider } from "@/components/ui/Toast";
import { AppRealtimeContext } from "@/lib/realtime/useAppRealtime";
import type { Meta, StoryObj } from "@storybook/react";
import { KeywordDetailHeaderChrome } from "./KeywordDetailHeaderChrome";
import { KeywordHeaderContext } from "./KeywordHeaderContext";
import { keywordRows } from "./keywords-fixtures";

const keyword = { ...keywordRows[0], id: "kw_a00000000000000000000000", device: "desktop" };
const targets = [keyword, { ...keyword, id: "kw_b00000000000000000000000", device: "mobile" }];
function HeaderContextStory({ longName = false }: { longName?: boolean }) {
  const projectMarkets = {
    markets: [
      {
        canonicalKey: keyword.location.canonicalKey,
        countryCode: "US",
        displayName: "United States",
        name: longName ? "United States national audience" : "United States",
        id: "pmkt_us",
        keywordCount: 1,
        languageCode: "en",
        languageLabel: "English",
        monthlyCostCents: 0,
        researchAvailable: true,
        status: "active" as const,
      },
    ],
    maxMarkets: 5,
    monthlyCostCents: 0,
    perMarketChecks: 1,
    projectId: "prj_story",
  };
  return (
    <AppRealtimeContext.Provider value={{ notifications: null, operations: [], status: "live" }}>
      <ToastProvider>
        <div className="min-h-screen bg-bg text-fg">
          <AppHeaderFrame
            activeProjectId="prj_story"
            canCreateWorkspace={false}
            context={
              <KeywordHeaderContext
                addKeywordsMatrixAction={async () => undefined}
                bulkDeleteAction={async () => undefined}
                canCreateKeyword
                canUpdateKeyword
                keyword={keyword}
                projectId="prj_story"
                projectMarkets={projectMarkets}
                targets={targets}
              />
            }
            notificationControl={
              <NotificationBellClient
                feed={{ items: [], unreadCount: 0 }}
                markAllNotificationsRead={async () => ({ updated: 0 })}
                markNotificationRead={async () => ({ updated: 0 })}
                refreshNotificationFeed={async () => ({ items: [], unreadCount: 0 })}
                projectRef="prj_story"
              />
            }
            projectRef="prj_story"
            user={{ name: "Demo Admin", email: "demo@example.com" }}
            workspaces={[]}
          />
          <div className="p-4 sm:p-7">
            <KeywordDetailHeaderChrome actions={null} keyword={keyword} timeZone="UTC" />
          </div>
        </div>
      </ToastProvider>
    </AppRealtimeContext.Provider>
  );
}
const meta = {
  component: HeaderContextStory,
  title: "Keyword detail/Page context",
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: { pathname: `/app/prj_story/rank-tracker/${keyword.id}` },
    },
    chromatic: { viewports: [390, 768, 1280] },
  },
} satisfies Meta<typeof HeaderContextStory>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const LongMarketName: Story = { args: { longName: true } };
