import { DateDisplayProvider, DateFormatProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PROJECT_RUNS_DEFAULT_QUERY } from "@/lib/runs/filters";
import { matchesProjectRunsQuery } from "@/lib/runs/project-runs-page";
import {
  compareTimelineTuples,
  projectRunTimelineSortTuple,
} from "@/lib/runs/project-runs-timeline";
import runMessages from "@/messages/core/en/project-runs.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { aiHistoryFixtures, aiRunFixture, gscRunFixture } from "./ai-runs.fixtures";
import { ProjectRunsContent } from "./ProjectRunsContent";
import { timelineFixtureRuns, timelineProjectRef } from "./project-runs-timeline.fixtures";

function Preview({
  attention = false,
  aiOnly = false,
}: Readonly<{ attention?: boolean; aiOnly?: boolean }>) {
  const query = {
    ...PROJECT_RUNS_DEFAULT_QUERY,
    source: aiOnly ? ("ai_tracking" as const) : ("all" as const),
    status: attention ? ("attention" as const) : ("all" as const),
  };
  const runs = [aiRunFixture, ...aiHistoryFixtures, gscRunFixture, ...timelineFixtureRuns]
    .filter((run) => matchesProjectRunsQuery(run, query))
    .sort((a, b) =>
      compareTimelineTuples(projectRunTimelineSortTuple(a), projectRunTimelineSortTuple(b)),
    );
  return (
    <FeatureMessagesProvider
      locale="en"
      messages={{ ...sharedMessages, ...runMessages }}
      timeZone="UTC"
    >
      <DateFormatProvider value="day_first">
        <DateDisplayProvider>
          <div className="p-4 sm:p-6">
            <ProjectRunsContent
              canMutate={false}
              operations={[]}
              page={{
                runs,
                nextCursor: null,
                counts: {
                  total: runs.length,
                  aiTracking: runs.filter((run) => run.kind === "ai").length,
                  rankChecks: runs.filter((run) => run.kind === "rank").length,
                  searchConsole: runs.filter((run) => run.kind === "gsc").length,
                },
              }}
              query={query}
              projectRef={timelineProjectRef}
              runNowAction={async () => {}}
              skipAction={async () => {}}
              readAt="2026-10-21T08:00:00Z"
            />
          </div>
        </DateDisplayProvider>
      </DateFormatProvider>
    </FeatureMessagesProvider>
  );
}
const meta = {
  component: Preview,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  title: "Runs/AI measurements",
} satisfies Meta<typeof Preview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AllSources: Story = {};
export const AiOnly: Story = { args: { aiOnly: true } };
export const NeedsAttention: Story = { args: { aiOnly: true, attention: true } };
