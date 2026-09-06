import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";
import { AddKeywordsDrawer, type ScheduleKeywordCandidate } from "./AddKeywordsDrawer";

const keywords = [
  "headless cms",
  "contentful alternative",
  "cms pricing",
  "best headless cms",
  "cms for ecommerce",
  "cms migration guide",
];

const candidates: ScheduleKeywordCandidate[] = Array.from({ length: 350 }, (_, index) => ({
  device: "Mobile",
  id: `kw_${String(index + 1).padStart(22, "0")}`,
  keyword: keywords[index] ?? `commercial cms keyword ${index + 1}`,
  market: "Spain",
  tags: ["commercial"],
  checks: "2",
}));

const meta = {
  component: AddKeywordsDrawer,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  title: "Dashboard - Schedules",
} satisfies Meta<typeof AddKeywordsDrawer>;

export default meta;

type Story = StoryObj<typeof meta>;

const args = {
  assignKeywordsAction: fn(async () => ({ updated: 350 })),
  candidates,
  initialFilters: { tag: "commercial" },
  onClose: fn(),
  open: true,
  projectId: "prj_abcdefghijklmnopqrstuvwx",
  scheduleId: "sch_abcdefghijklmnopqrstuvwx",
  scheduleName: "Daily 06:00",
};

export const DrawerAddKeywords: Story = {
  args,
  name: "drawer-add-keywords",
  render: (storyArgs) => (
    <main className="min-h-[940px] bg-bg text-fg">
      <AddKeywordsDrawer {...storyArgs} />
    </main>
  ),
};

export const DrawerSelectAll: Story = {
  args: { ...args, initialSelectedKeywordIds: candidates.map((candidate) => candidate.id) },
  name: "drawer-select-all",
  render: DrawerAddKeywords.render,
};

export const DrawerStageKeywords: Story = {
  args: { ...args, onSelect: fn(), scheduleId: "new" },
  name: "drawer-stage-keywords",
  render: DrawerAddKeywords.render,
};
