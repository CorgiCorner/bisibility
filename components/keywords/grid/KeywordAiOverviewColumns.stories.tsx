import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { ProjectRankTrackerMessages } from "@/components/rank-tracker/ProjectRankTrackerMessages";
import type { KeywordRow } from "@/lib/queries/keyword-row-types";
import type { RankTrackerAiOverviewFact } from "@/lib/queries/rank-tracker-ai-overview-facts";
import type { Meta, StoryObj } from "@storybook/react";
import {
  AiOverviewDomainCell,
  AiOverviewPageCell,
  AiOverviewStatusCell,
} from "./KeywordAiOverviewColumns";

const row = { id: "kw_story", device: "desktop", keyword: "directory" } as KeywordRow;
const cited: RankTrackerAiOverviewFact = {
  keywordId: row.id,
  checkedAt: "2026-11-09T07:11:00.000Z",
  citedPath: "/",
  citation: {
    shown: true,
    cited: true,
    citedPosition: 2,
    citedUrl: "https://example.com/",
    sourceCount: 3,
    complete: true,
  },
  overview: { present: true, paragraphs: ["Stored answer"], sources: [] },
};
const incomplete: RankTrackerAiOverviewFact = {
  ...cited,
  citedPath: null,
  citation: {
    ...cited.citation,
    cited: false,
    citedPosition: null,
    citedUrl: null,
    complete: false,
  },
};

function Cells({ fact }: { fact?: RankTrackerAiOverviewFact }) {
  return (
    <div className="grid gap-2 p-6 text-fg">
      <AiOverviewStatusCell row={row} fact={fact} />
      <AiOverviewDomainCell row={row} fact={fact} />
      <AiOverviewPageCell row={row} fact={fact} />
    </div>
  );
}

const meta = {
  title: "Keywords/AI Overviews view",
  component: Cells,
  decorators: [
    (Story) => (
      <ProjectRankTrackerMessages>
        <DateDisplayProvider>
          <Story />
        </DateDisplayProvider>
      </ProjectRankTrackerMessages>
    ),
  ],
} satisfies Meta<typeof Cells>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Cited: Story = { args: { fact: cited } };
export const Incomplete: Story = { args: { fact: incomplete } };
export const NotChecked: Story = { args: {} };
