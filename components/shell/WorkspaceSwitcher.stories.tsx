import { WorkspaceSwitcher } from "@/components/shell/WorkspaceSwitcher";
import type { WorkspaceSummary } from "@/lib/queries/workspaces";
import type { Meta, StoryObj } from "@storybook/react";

const faviconStates = [
  {
    domain: "bisibility.com",
    id: "workspace_bisibility",
    isSample: false,
    keywordCount: 24,
    latestCompletedRankCheckAt: new Date("2026-08-09T10:00:00.000Z"),
    name: "bisibility.com",
    onboardingCompletedAt: new Date("2026-08-01T09:00:00.000Z"),
    plan: "pro",
    publicId: "prj_bisibility",
    role: "owner",
    state: "populated",
    writeMode: "active",
  },
  {
    domain: "no-favicon.example.com",
    id: "workspace_missing",
    isSample: false,
    keywordCount: 8,
    latestCompletedRankCheckAt: null,
    name: "No favicon fallback",
    onboardingCompletedAt: new Date("2026-08-02T09:00:00.000Z"),
    plan: "free",
    publicId: "prj_missing",
    role: "admin",
    state: "no-data",
    writeMode: "active",
  },
] satisfies WorkspaceSummary[];

const optOutState = {
  domain: "opt-out.example.org",
  id: "workspace_opt_out",
  isSample: false,
  keywordCount: 0,
  latestCompletedRankCheckAt: null,
  name: "Opt-out mode",
  onboardingCompletedAt: new Date("2026-08-03T09:00:00.000Z"),
  plan: "free",
  publicId: "prj_opt_out",
  role: "owner",
  state: "empty",
  writeMode: "active",
} satisfies WorkspaceSummary;

function Frame({ workspaces = faviconStates }: { workspaces?: WorkspaceSummary[] }) {
  return (
    <div className="min-h-[360px] w-[380px] bg-bg p-6 text-fg">
      <WorkspaceSwitcher
        activeProjectId={workspaces[0]?.id ?? ""}
        canCreateWorkspace={false}
        variant="boxed"
        workspaces={workspaces}
      />
    </div>
  );
}

const meta = {
  title: "Shell/Workspace switcher",
  component: WorkspaceSwitcher,
  args: {
    activeProjectId: "workspace_bisibility",
    canCreateWorkspace: false,
    variant: "boxed",
    workspaces: faviconStates,
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof WorkspaceSwitcher>;

export default meta;

type Story = StoryObj<typeof meta>;

export const DomainFaviconStates: Story = {
  name: "Domain favicon states",
  render: () => <Frame />,
};

export const DomainIconsOptedOut: Story = {
  name: "Domain icons opted out",
  render: () => <Frame workspaces={[optOutState]} />,
};
