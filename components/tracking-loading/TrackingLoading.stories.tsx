import CompetitorsLoading from "@/app/(regional)/app/(workspace)/[project]/competitors/loading";
import TrackerLoading from "@/app/(regional)/app/(workspace)/[project]/rank-tracker/loading";
import { KeywordDetailPageSkeleton } from "@/components/keyword-detail/shared/KeywordDetailPageSkeleton";
import { PageContent } from "@/components/shell/PageContent";
import type { Meta, StoryObj } from "@storybook/react";
import { AiTrackingLoading } from "./AiTrackingLoading";
import { AiVisibilityLoading } from "./AiVisibilityLoading";
import { DashboardLoadingContent } from "./DashboardLoading";

type Props = {
  view:
    | "dashboard"
    | "general"
    | "local"
    | "competitors-dashboard"
    | "tracker"
    | "detail"
    | "ai-tracking"
    | "ai-visibility"
    | "competitors";
  theme: "light" | "dark";
};
function TrackingLoadingPreview({ view, theme }: Readonly<Props>) {
  return (
    <div
      data-theme={theme}
      className="min-h-screen bg-bg p-4 text-fg sm:p-5 lg:p-7"
      data-loading-preview
      data-loading-view={view}
    >
      {view === "tracker" ? (
        <TrackerLoading />
      ) : view === "detail" ? (
        <PageContent>
          <KeywordDetailPageSkeleton ariaLabel="Loading keyword detail" />
        </PageContent>
      ) : view === "ai-tracking" ? (
        <AiTrackingLoading />
      ) : view === "ai-visibility" ? (
        <AiVisibilityLoading />
      ) : view === "competitors" ? (
        <CompetitorsLoading />
      ) : (
        <PageContent>
          <DashboardLoadingContent
            preset={
              view === "dashboard"
                ? undefined
                : view === "competitors-dashboard"
                  ? "competitors"
                  : view
            }
          />
        </PageContent>
      )}
    </div>
  );
}
const meta = {
  title: "Tracking/Loading audit",
  component: TrackingLoadingPreview,
  parameters: { layout: "fullscreen", themeControls: false },
  args: { view: "dashboard", theme: "dark" },
} satisfies Meta<typeof TrackingLoadingPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dashboard: Story = {};
export const General: Story = { args: { view: "general" } };
export const Local: Story = { args: { view: "local" } };
export const CompetitorsDashboard: Story = { args: { view: "competitors-dashboard" } };
export const RankTracker: Story = { args: { view: "tracker" } };
export const KeywordDetail: Story = { args: { view: "detail" } };
export const AiTracking: Story = { args: { view: "ai-tracking" } };
export const AiVisibility: Story = { args: { view: "ai-visibility" } };
export const Competitors: Story = { args: { view: "competitors" } };
