import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PROJECT_RUNS_DEFAULT_QUERY, type ProjectRunsQuery } from "@/lib/runs/filters";
import runMessages from "@/messages/core/en/project-runs.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ProjectRunsFilterControls } from "./ProjectRunsFilters";
import { ProjectRunsTimelineControls } from "./ProjectRunsTimelineTabs";

function TimelineControlsPreview({ attention = false }: Readonly<{ attention?: boolean }>) {
  const [query, setQuery] = useState<ProjectRunsQuery>({
    ...PROJECT_RUNS_DEFAULT_QUERY,
    section: "active",
    status: attention ? "attention" : "all",
  });
  return (
    <FeatureMessagesProvider
      locale="en"
      messages={{ ...sharedMessages, ...runMessages }}
      timeZone="UTC"
    >
      <div className="mx-auto grid max-w-5xl gap-5 p-4 sm:p-8">
        <h1 className="m-0 text-[21px] font-semibold">Runs</h1>
        <ProjectRunsFilterControls query={query} onQueryChange={setQuery} />
        <ProjectRunsTimelineControls query={query} onQueryChange={setQuery} />
      </div>
    </FeatureMessagesProvider>
  );
}

const meta = {
  component: TimelineControlsPreview,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  title: "Runs/Timeline controls",
} satisfies Meta<typeof TimelineControlsPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Interactive: Story = {};
export const NeedsAttention: Story = { args: { attention: true } };
