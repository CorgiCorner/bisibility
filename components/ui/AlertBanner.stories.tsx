import { AlertBanner } from "@/components/ui/AlertBanner";
import { rankTrackerTabPath } from "@/lib/routing/app-path";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/AlertBanner",
  component: AlertBanner,
  decorators: [
    (Story) => (
      <div className="min-h-[220px] bg-bg p-6 text-fg">
        <div className="overflow-hidden rounded-[14px] border border-border bg-bg-elev">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof AlertBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { tint: "red", title: "2 rank checks failed in the last 24 hours." },
  render: () => (
    <>
      <AlertBanner
        action={{ icon: "retry", label: "Retry", onClick: () => undefined }}
        detail="headless cms: Provider request failed."
        onDismiss={() => undefined}
        tint="red"
        title="2 rank checks failed in the last 24 hours."
      />
      <AlertBanner
        action={{
          href: rankTrackerTabPath("prj_story", "checks"),
          icon: "arrow",
          label: "View check runs",
        }}
        detail="Spent $5.00 of $5.00 this month."
        tint="yellow"
        title="Rank checks paused - monthly budget reached."
      />
    </>
  ),
};

export const RedTint: Story = {
  args: {
    detail: "headless cms: Provider request failed.",
    tint: "red",
    title: "2 rank checks failed in the last 24 hours.",
  },
};

export const YellowTint: Story = {
  args: {
    detail: "Spent $5.00 of $5.00 this month.",
    tint: "yellow",
    title: "Rank checks paused - monthly budget reached.",
  },
};

export const WithActionArrow: Story = {
  args: {
    action: {
      href: rankTrackerTabPath("prj_story", "checks"),
      icon: "arrow",
      label: "View check runs",
    },
    tint: "yellow",
    title: "Rank checks paused - monthly budget reached.",
  },
};

export const WithRetry: Story = {
  args: {
    action: { icon: "retry", label: "Retry", onClick: () => undefined },
    detail: "headless cms: Provider request failed.",
    tint: "red",
    title: "2 rank checks failed in the last 24 hours.",
  },
};

export const Dismissible: Story = {
  args: {
    detail: "headless cms: Provider request failed.",
    onDismiss: () => undefined,
    tint: "red",
    title: "2 rank checks failed in the last 24 hours.",
  },
};
