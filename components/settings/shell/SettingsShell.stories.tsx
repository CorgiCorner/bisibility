import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { SettingsShellLoading } from "@/components/settings/shell/SettingsShellLoading";
import { SettingsField } from "@/components/settings/shell/settings-field-widths";
import { settingsCardGeometryClassNames } from "@/components/settings/shell/settings-layout";
import { FieldLabel, Input } from "@/components/ui";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";

const projectRef = "prj_7Kd2Qf9m";

const meta = {
  title: "Settings/Shell",
  component: SettingsShell,
  args: {
    activeSection: "general",
    children: null,
    projectRef,
  },
  decorators: [
    (Story) => (
      <main className="min-h-screen bg-bg p-4 text-fg sm:p-6">
        <Story />
      </main>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
} satisfies Meta<typeof SettingsShell>;

export default meta;

type Story = StoryObj<typeof meta>;

function SampleCard({ className }: Readonly<{ className?: string }>) {
  return (
    <SettingsCard
      className={className}
      description="Per-card changes stay local until you save them."
      title="Project details"
    >
      <div className="flex flex-col gap-4">
        <SettingsField width="field">
          <FieldLabel htmlFor="shell-project-name" label="Project name" />
          <Input defaultValue="Acme" id="shell-project-name" />
        </SettingsField>
        <SettingsField width="field">
          <FieldLabel htmlFor="shell-domain" label="Domain" />
          <Input defaultValue="example.com" id="shell-domain" />
        </SettingsField>
        <SettingsField width="full">
          <FieldLabel htmlFor="shell-note" label="Description" />
          <Input defaultValue="A settled full-width field frame." id="shell-note" />
        </SettingsField>
      </div>
    </SettingsCard>
  );
}

export const Settled: Story = {
  render: () => (
    <div data-settings-shell-story="settled">
      <SettingsShell activeSection="general" projectRef={projectRef}>
        <div className="space-y-5">
          <SampleCard className={settingsCardGeometryClassNames.form} />
          <SettingsCard
            className={settingsCardGeometryClassNames.compact}
            description="This compact frame demonstrates a second settled card."
            title="Notification defaults"
          >
            <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">
              Controls remain in their section-specific implementation slices.
            </p>
          </SettingsCard>
        </div>
      </SettingsShell>
    </div>
  ),
};

export const CurrentSubnav: Story = {
  name: "Desktop subnavigation - current and hover",
  parameters: {
    docs: {
      description: {
        story:
          "Developers is current with no persistent background. Hover any row to inspect the nav-active background.",
      },
    },
  },
  render: () => (
    <div data-settings-shell-story="desktop-subnav-current-and-hover">
      <SettingsShell activeSection="developers" projectRef={projectRef}>
        <SampleCard className={settingsCardGeometryClassNames.form} />
      </SettingsShell>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("link", { name: "Developers" })).not.toHaveClass("bg-nav-active");
    await userEvent.hover(canvas.getByRole("link", { name: "Tracking" }));
  },
};

export const FieldWidths: Story = {
  render: () => (
    <div className="space-y-4" data-settings-shell-story="field-widths">
      <h1 className="sr-only">Settings field widths</h1>
      <SettingsField className="rounded-[9px] border border-border bg-bg-elev p-3" width="field">
        Field - 340px, every labelled input
      </SettingsField>
      <SettingsField className="rounded-[9px] border border-border bg-bg-elev p-3" width="full">
        Full - 640px, a switch or a table that owns the card row
      </SettingsField>
    </div>
  ),
};

export const Loading: Story = {
  render: () => (
    <div data-settings-shell-story="loading">
      <h1 className="sr-only">Settings loading state</h1>
      <SettingsShellLoading />
    </div>
  ),
};
