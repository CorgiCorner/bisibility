import type { DomainChangeRequest } from "@/components/settings/general/DomainChangeConfirmation";
import { GeneralSettingsContent } from "@/components/settings/general/GeneralSettingsContent";
import {
  GeneralSettingsLoading,
  GeneralSettingsRouteLoading,
} from "@/components/settings/general/GeneralSettingsLoading";
import type { UpdateProjectDetails } from "@/components/settings/general/ProjectDetailsCard";
import type {
  CreateTagAction,
  DeleteTagAction,
} from "@/components/settings/general/TagsSegmentsCard";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";

const project = {
  domain: "example.com",
  name: "Example project",
  projectId: "prj_7Kd2Qf9m",
};

const tags = [
  { color: "var(--blue)", label: "brand" },
  { color: "var(--green)", label: "product" },
  { color: "var(--purple)", label: "blog" },
  { color: "var(--yellow)", label: "docs" },
  { color: "var(--accent)", label: "high-intent" },
  { color: "var(--blue)", label: "competitor" },
];

const createTag: CreateTagAction = async () => ({ ok: true, value: { created: true } });
const deleteTag: DeleteTagAction = async () => ({ ok: true, value: { deleted: 1 } });
const requestDomainChange = async (_input: DomainChangeRequest) => ({
  domain: "next.example.com",
  projectId: project.projectId,
});
const updateProject: UpdateProjectDetails = async (input) => ({ name: input.name });

function GeneralStoryShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="min-h-screen bg-bg p-4 text-fg sm:p-6">
      <SettingsShell activeSection="general" projectRef={project.projectId}>
        {children}
      </SettingsShell>
    </main>
  );
}

const meta = {
  component: GeneralSettingsContent,
  parameters: { nextjs: { appDirectory: true } },
  title: "Settings/General",
} satisfies Meta<typeof GeneralSettingsContent>;

export default meta;

type Story = StoryObj<typeof meta>;

const settledArgs = {
  canCreateTags: true,
  canDeleteTags: true,
  canEditProject: true,
  createTag,
  deleteTag,
  project,
  requestDomainChange,
  tags,
  updateProject,
} satisfies Story["args"];

export const Settled: Story = {
  args: settledArgs,
  render: (args) => (
    <GeneralStoryShell>
      <GeneralSettingsContent {...args} />
    </GeneralStoryShell>
  ),
};

export const DomainConfirmationBoundary: Story = {
  args: {
    ...settledArgs,
    initialDomainConfirmationOpen: true,
  },
  name: "Domain confirmation boundary (integration)",
  render: (args) => (
    <GeneralStoryShell>
      <GeneralSettingsContent {...args} />
    </GeneralStoryShell>
  ),
};

export const Loading: Story = {
  args: settledArgs,
  render: () => (
    <GeneralStoryShell>
      <GeneralSettingsLoading />
    </GeneralStoryShell>
  ),
};

export const RouteLoading: Story = {
  args: settledArgs,
  name: "Route loading",
  render: () => (
    <main className="min-h-screen bg-bg p-4 text-fg sm:p-6">
      <GeneralSettingsRouteLoading />
    </main>
  ),
};
