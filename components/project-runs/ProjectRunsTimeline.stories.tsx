import { DateDisplayProvider, DateFormatProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import { PROJECT_RUNS_DEFAULT_QUERY } from "@/lib/runs/filters";
import runMessages from "@/messages/core/pl/project-runs.json";
import sharedMessages from "@/messages/core/pl/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { ProjectRunsContent } from "./ProjectRunsContent";
import { timelineFixtureRuns, timelineProjectRef } from "./project-runs-timeline.fixtures";

function TimelinePreview({ canMutate }: Readonly<{ canMutate: boolean }>) {
  return (
    <FeatureMessagesProvider
      locale="pl"
      messages={{ ...sharedMessages, ...runMessages }}
      timeZone="Europe/Warsaw"
    >
      <DateFormatProvider value="day_first">
        <DateDisplayProvider>
          <div className="p-4 sm:p-6">
            <PageContent className="grid gap-4">
              <h1 className="m-0 text-[21px] font-semibold text-fg">Wykonania</h1>
              <ProjectRunsContent
                canMutate={canMutate}
                operations={[]}
                page={{
                  counts: {
                    rankChecks: timelineFixtureRuns.length,
                    searchConsole: 0,
                    total: timelineFixtureRuns.length,
                  },
                  nextCursor: null,
                  runs: timelineFixtureRuns,
                }}
                projectRef={timelineProjectRef}
                query={PROJECT_RUNS_DEFAULT_QUERY}
                runNowAction={async () => {}}
                skipAction={async () => {}}
              />
            </PageContent>
          </div>
        </DateDisplayProvider>
      </DateFormatProvider>
    </FeatureMessagesProvider>
  );
}

const meta = {
  component: TimelinePreview,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true }, themeControls: false },
  title: "Runs/Timeline",
} satisfies Meta<typeof TimelinePreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Editor: Story = { args: { canMutate: true } };
export const Viewer: Story = { args: { canMutate: false } };
