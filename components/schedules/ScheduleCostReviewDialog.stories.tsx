import type { ScheduleChangePreview } from "@/lib/schedules/preview";
import type { Meta, StoryObj } from "@storybook/react";
import { ScheduleCostReviewDialog } from "./ScheduleCostReviewDialog";

const preview: ScheduleChangePreview = {
  capacity: null,
  cost_before_cents: 120,
  cost_after_cents: 840,
  requires_review: true,
  review_reasons: ["cost_increase"],
  preview_token: "story",
  expected_revision: "1",
  window_start: "2026-10-01T00:00:00.000Z",
};
const meta = {
  title: "Schedules/Cost review",
  component: ScheduleCostReviewDialog,
  args: { preview, submitting: false, onConfirm: () => {}, onCancel: () => {} },
  parameters: { themeControls: false },
} satisfies Meta<typeof ScheduleCostReviewDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Standard: Story = {};
export const CapacityExceeded: Story = {
  args: {
    preview: {
      ...preview,
      capacity: {
        exceeded: true,
        dimensions: {
          scheduledKeywords: { exceeded: true, limit: 100, projected: 125 },
          scheduleFrequencies: { exceeded: true, limit: 1, projected: 7 },
        },
      },
    },
  },
};
export const StaleReview: Story = { args: { changed: true } };
export const LongReasons: Story = {
  globals: { locale: "es-ES" },
  args: {
    emptyScheduleCreated: true,
    preview: {
      ...preview,
      cost_after_cents: null,
      review_reasons: [
        "cost_increase",
        "manual_to_scheduled",
        "provider_route_change",
        "price_unknown",
      ],
    },
  },
};
