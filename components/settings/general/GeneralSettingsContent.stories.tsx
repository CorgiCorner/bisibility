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
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { DEFAULT_TIME_ZONE } from "@/i18n/formats";
import projectSettingsGeneralMessages from "@/messages/core/en/project-settings-general.json";
import projectSettingsShellMessages from "@/messages/core/en/project-settings-shell.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";

const project = {
  domain: "example.com",
  name: "Example project",
  projectId: "prj_7Kd2Qf9m",
};

const tags = [
  { color: "var(--blue)", keywordCount: 0, label: "brand", segmentCount: 0 },
  { color: "var(--green)", keywordCount: 0, label: "product", segmentCount: 0 },
  { color: "var(--purple)", keywordCount: 0, label: "blog", segmentCount: 0 },
  { color: "var(--yellow)", keywordCount: 0, label: "docs", segmentCount: 0 },
  { color: "var(--accent)", keywordCount: 0, label: "high-intent", segmentCount: 0 },
  { color: "var(--blue)", keywordCount: 0, label: "competitor", segmentCount: 0 },
];

const createTag: CreateTagAction = async () => ({ ok: true, value: { created: true } });
const deleteTag: DeleteTagAction = async () => ({ ok: true, value: { deleted: 1 } });
const requestDomainChange = async (_input: DomainChangeRequest) => ({
  domain: "next.example.com",
  projectId: project.projectId,
});
const updateProject: UpdateProjectDetails = async (input) => ({ name: input.name });
const generalSettingsMessages = mergeMessageCatalogs(
  sharedMessages,
  projectSettingsShellMessages,
  projectSettingsGeneralMessages,
);

function GeneralStoryShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <FeatureMessagesProvider
      locale={DEFAULT_LOCALE}
      messages={generalSettingsMessages}
      timeZone={DEFAULT_TIME_ZONE}
    >
      <main className="min-h-screen bg-bg p-4 text-fg sm:p-6">
        <SettingsShell activeSection="general" projectRef={project.projectId}>
          {children}
        </SettingsShell>
      </main>
    </FeatureMessagesProvider>
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

import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
