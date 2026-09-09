import type { Meta, StoryObj } from "@storybook/react";
import { runPageFixture } from "./RunPageFixtures";
import { runSummary } from "./RunPageModel";
import { RunPageTargets } from "./RunPageTargets";

function summary() {
  return runSummary(runPageFixture.run, {
    formatInstant: (instant) => instant,
    now: runPageFixture.now,
  });
}

const meta = {
  args: {
    busy: null,
    canMutate: true,
    cursor: runPageFixture.nextCursor,
    filter: "all",
    items: runPageFixture.items,
    onCancel: () => undefined,
    onFilter: () => undefined,
    onLoadMore: () => undefined,
    onMutate: () => undefined,
    projectRef: "prj_example",
    run: runPageFixture.run,
    summary: summary(),
  },
  component: RunPageTargets,
  decorators: [
    (Story, context) => (
      <main
        className="min-h-dvh bg-bg p-4 text-fg lg:p-8"
        data-theme={context.parameters.theme ?? "light"}
      >
        <div className="mx-auto max-w-[1200px]">
          <Story />
        </div>
      </main>
    ),
  ],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  title: "Rank tracker/Run targets",
} satisfies Meta<typeof RunPageTargets>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { name: "default" };

export const ThemeDark: Story = { name: "theme-dark", parameters: { theme: "dark" } };
