import { DateDisplayProvider, DateFormatProvider } from "@/components/dates/DateFormatProvider";
import type { DomainRatingView } from "@/lib/domain-rating/history";
import type { Meta, StoryObj } from "@storybook/react";
import { DomainRatingCard } from "./DomainRatingCard";
import { DomainRatingSettings } from "./DomainRatingSettings";

const data: DomainRatingView = {
  projectId: "prj_example",
  domain: "example.com",
  enabled: true,
  source: "own",
  hasOwnConnection: true,
  lastAttemptAt: "2026-10-28T06:00:00Z",
  lastSuccessAt: "2026-10-28T06:00:00Z",
  lastError: null,
  points: Array.from({ length: 90 }, (_, i) => ({
    day: new Date(Date.UTC(2026, 7, 1 + i)).toISOString().slice(0, 10),
    rating:
      i === 45 || i === 46
        ? null
        : Math.round((32 + Math.floor(i / 9) * 1.3 + Math.sin(i / 8) * 1.4) * 10) / 10,
  })),
};
const meta = {
  title: "Overview/DomainRatingCard",
  parameters: { nextjs: { appDirectory: true } },
  component: DomainRatingCard,
  decorators: [
    (Story) => (
      <DateFormatProvider value="month_first">
        <DateDisplayProvider>
          <div className="max-w-5xl p-6">
            <Story />
          </div>
        </DateDisplayProvider>
      </DateFormatProvider>
    ),
  ],
  args: { data, today: "2026-10-29" },
} satisfies Meta<typeof DomainRatingCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const History: Story = {};
export const StandardWidth: Story = {
  render: (args) => (
    <div className="max-w-lg">
      <DomainRatingCard {...args} />
    </div>
  ),
};
export const Empty: Story = {
  args: { data: { ...data, points: [], source: null, lastAttemptAt: null, lastSuccessAt: null } },
};
export const FirstMeasurement: Story = {
  args: { data: { ...data, points: [{ day: "2026-10-28", rating: 0 }] } },
};
export const Paused: Story = { args: { data: { ...data, enabled: false } } };
export const Managed: Story = { args: { data: { ...data, source: "hosted" } } };
export const FailedCheck: Story = { args: { data: { ...data, lastError: "authentication" } } };

export const ConnectedTrackingSettings: Story = {
  render: () => <DomainRatingSettings data={data} canEdit />,
};
export const PausedConnectionSettings: Story = {
  render: () => <DomainRatingSettings data={{ ...data, source: null }} canEdit />,
};
