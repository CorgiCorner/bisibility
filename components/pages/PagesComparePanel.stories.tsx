import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import type { CompareView } from "@/lib/pages/compare-model";
import { compareWindow } from "@/lib/pages/compare-model";
import { defaultProjectPagesQuery } from "@/lib/pages/url-state";
import pagesMessages from "@/messages/core/en/project-pages.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";
import { PagesComparePanel } from "./PagesComparePanel";

const messages = mergeMessageCatalogs(sharedMessages, pagesMessages);
const monitored = compareWindow("2026-10-15", "2026-10-28");
const finished = compareWindow("2026-09-01", "2026-10-15");
const short = compareWindow("2026-10-19", "2026-10-28");

const tags = [
  { id: "tag_changed", name: "FAQ added", pages: 6 },
  { id: "tag_control", name: "FAQ control", pages: 6 },
];

const annotation = {
  dateKey: monitored.moment,
  id: "sig_story",
  title: "FAQ on feature pages",
};

function points(
  window: ReturnType<typeof compareWindow>,
  changedAfter: number,
  unchangedAfter: number,
) {
  const days = [...window.before, ...window.after];
  return days.map((day) => ({
    changed: window.after.includes(day) ? changedAfter : 100,
    day,
    unchanged: window.after.includes(day) ? unchangedAfter : 100,
  }));
}

function view(patch: Partial<CompareView> & Pick<CompareView, "empty" | "result">): CompareView {
  return {
    annotationId: annotation.id,
    annotations: [annotation],
    changedTagId: tags[0]?.id ?? null,
    metrics: [
      { disabledReason: null, id: "clicks" },
      { disabledReason: null, id: "impressions" },
      { disabledReason: "not_connected", id: "sessions" },
    ],
    selectedMetric: "clicks",
    tags,
    unchangedTagId: tags[1]?.id ?? null,
    ...patch,
  };
}

const meta = {
  component: PagesComparePanel,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
        <DateDisplayProvider>
          <TooltipProvider>
            <div className="min-w-0 bg-bg p-4 text-fg">
              <Story />
            </div>
          </TooltipProvider>
        </DateDisplayProvider>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Pages/Compare",
} satisfies Meta<typeof PagesComparePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const args = {
  onQuery: fn(),
  projectId: "prj_story",
  query: { ...defaultProjectPagesQuery, tab: "compare" as const },
};

export const Monitoring: Story = {
  args: {
    ...args,
    compare: view({
      empty: null,
      result: {
        annotation,
        changed: { lowVolume: false, pageCount: 6, percent: 20 },
        day: monitored.day,
        difference: { kind: "points", points: 14 },
        forecast: null,
        markers: [
          { dateKey: monitored.moment, id: annotation.id, kind: "note", title: annotation.title },
          {
            dateKey: monitored.after[2] ?? monitored.moment,
            id: "update_story",
            kind: "search_engine",
            title: "Example update",
          },
        ],
        moment: monitored.moment,
        overlapPages: 1,
        phase: monitored.phase,
        points: points(monitored, 120, 106),
        unchanged: { lowVolume: false, pageCount: 6, percent: 6 },
      },
    }),
  },
};

export const Finished: Story = {
  args: {
    ...args,
    compare: view({
      empty: null,
      result: {
        annotation: { ...annotation, dateKey: finished.moment },
        changed: { lowVolume: false, pageCount: 6, percent: 12 },
        day: finished.day,
        difference: { kind: "points", points: 9 },
        forecast: null,
        markers: [],
        moment: finished.moment,
        overlapPages: 0,
        phase: finished.phase,
        points: points(finished, 112, 103),
        unchanged: { lowVolume: false, pageCount: 6, percent: 3 },
      },
    }),
  },
};

export const NotEnoughData: Story = {
  args: {
    ...args,
    compare: view({
      empty: null,
      result: {
        annotation,
        changed: { lowVolume: true, pageCount: 6, percent: null },
        day: short.day,
        difference: { kind: "not_enough" },
        forecast: null,
        markers: [],
        moment: short.moment,
        overlapPages: 0,
        phase: "monitoring",
        points: points(short, 100, 100),
        unchanged: { lowVolume: false, pageCount: 6, percent: 4 },
      },
    }),
  },
};

export const Empty: Story = {
  args: {
    ...args,
    compare: view({
      annotationId: null,
      annotations: [],
      changedTagId: null,
      empty: "no_tags",
      result: null,
      tags: [],
      unchangedTagId: null,
    }),
  },
};
