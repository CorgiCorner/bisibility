import { AccountShell } from "@/components/account/AccountShell";
import { Card, SectionTitle } from "@/components/ui";
import type { Meta, StoryObj } from "@storybook/react";

type ActiveSection = "profile" | "preferences" | "security";

function AccountShellFrame({ active }: Readonly<{ active: ActiveSection }>) {
  return (
    <AccountShell activeSection={active}>
      <div className="flex flex-col gap-5.5">
        <section className="space-y-3.5">
          <SectionTitle>
            {active === "profile"
              ? "Profile"
              : active === "preferences"
                ? "Preferences"
                : "Security"}
          </SectionTitle>
          <Card className="rounded-[14px] p-5" size="md">
            <p className="m-0 text-[13px] leading-normal text-fg-muted">
              Representative account section body rendered inside the new account shell at desktop
              width, mirroring the SettingsShell sidebar and grid geometry.
            </p>
          </Card>
        </section>
      </div>
    </AccountShell>
  );
}

const meta = {
  args: {
    activeSection: "profile",
    children: null,
  },
  component: AccountShell,
  decorators: [
    (Story) => (
      <main className="p-6">
        <Story />
      </main>
    ),
  ],
  parameters: {
    layout: "padded",
    nextjs: { appDirectory: true },
    viewport: { defaultViewport: "desktop" },
  },
  render: (args) => <AccountShellFrame active={args.activeSection} />,
  title: "Account/Account shell",
} satisfies Meta<typeof AccountShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Profile: Story = {
  args: { activeSection: "profile" },
};

export const Preferences: Story = {
  args: { activeSection: "preferences" },
};

export const Security: Story = {
  args: { activeSection: "security" },
};
