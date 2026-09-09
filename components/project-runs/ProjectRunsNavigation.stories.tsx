import { SchedulesList } from "@/components/schedules/SchedulesList";
import { PageContent } from "@/components/shell/PageContent";
import { PROJECT_RUNS_DEFAULT_QUERY } from "@/lib/runs/filters";
import type { Meta, StoryObj } from "@storybook/react";
import { ProjectRunsContent } from "./ProjectRunsContent";
import { ProjectRunsTabs } from "./ProjectRunsTabs";

function RunsNavigation({ active }: Readonly<{ active: "runs" | "upcoming" | "schedules" }>) {
  const projectRef = "prj_story";
  return (
    <div className="p-4 sm:p-6">
      <PageContent className="grid gap-4">
        <header>
          <h1 className="m-0 text-[21px] font-semibold text-fg">Runs</h1>
          <p className="mt-1 text-[12.5px] text-fg-muted">
            Rank checks and Search Console imports for this project.
          </p>
        </header>
        {active === "schedules" ? (
          <>
            <ProjectRunsTabs active="schedules" projectRef={projectRef} />
            <SchedulesList
              canUpdate
              projectId={projectRef}
              projectRef={projectRef}
              schedules={[
                {
                  enabled: true,
                  frequency: "daily",
                  isDefault: true,
                  keywordCount: 10,
                  name: "Daily 06:00",
                  publicId: "sch_daily",
                  timeOfDay: "06:00",
                  timezone: "Europe/Warsaw",
                  nextRunLabel: "tomorrow 06:00",
                },
              ]}
            />
          </>
        ) : (
          <ProjectRunsContent
            canMutate
            operations={[]}
            page={{
              counts: { rankChecks: 0, searchConsole: 0, total: 0 },
              nextCursor: null,
              runs: [],
            }}
            projectRef={projectRef}
            query={{
              ...PROJECT_RUNS_DEFAULT_QUERY,
              view: active === "upcoming" ? "planned" : "runs",
            }}
            runNowAction={async () => {}}
            skipAction={async () => {}}
          />
        )}
      </PageContent>
    </div>
  );
}

const meta = {
  component: RunsNavigation,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  title: "Runs/Navigation",
} satisfies Meta<typeof RunsNavigation>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Runs: Story = { args: { active: "runs" } };
export const Upcoming: Story = { args: { active: "upcoming" } };
export const Schedules: Story = { args: { active: "schedules" } };
