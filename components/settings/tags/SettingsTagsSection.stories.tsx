import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import {
  type SettingsTagActions,
  SettingsTagsSection,
} from "@/components/settings/tags/SettingsTagsSection";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { DEFAULT_TIME_ZONE } from "@/i18n/formats";
import type { SettingsTagRow } from "@/lib/queries/tag-settings";
import projectPagesMessages from "@/messages/core/en/project-pages.json";
import projectSettingsShellMessages from "@/messages/core/en/project-settings-shell.json";
import projectSettingsTagsMessages from "@/messages/core/en/project-settings-tags.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";

const projectId = "prj_7Kd2Qf9m";

const rule = {
  autoJoin: true,
  excludePatterns: [],
  kind: "path_pattern" as const,
  pattern: "/docs/{slug}",
  sitemapUrl: null,
  tagTargetingKeywords: false,
  urls: [],
};

const rows: SettingsTagRow[] = [
  {
    id: "tag_docs",
    keywords: 12,
    name: "Docs",
    pages: 40,
    rule,
    ruleLabel: { kind: "pattern", pattern: "/docs/{slug}" },
    segmentCount: 1,
    usage: [
      { kind: "alert", name: "Clicks drop" },
      { kind: "keyword_segment", name: "Docs terms" },
    ],
  },
  {
    id: "tag_guides",
    keywords: 0,
    name: "Guides",
    pages: 3,
    rule: null,
    ruleLabel: { kind: "urls", count: 3 },
    segmentCount: 0,
    usage: [{ kind: "saved_view", name: "Guide report" }],
  },
  {
    id: "tag_brand",
    keywords: 4,
    name: "Brand",
    pages: 0,
    rule: null,
    ruleLabel: { kind: "none" },
    segmentCount: 0,
    usage: [],
  },
];

const actions: SettingsTagActions = {
  deleteTag: async () => ({ ok: true, value: { deleted: 1 } }),
  mergeTag: async () => ({ ok: true, value: { merged: true } }),
  previewRule: async () => ({
    sample: ["https://example.com/docs/start"],
    total: 1,
    truncated: false,
  }),
  renameTag: async () => ({ ok: true, value: { merged: false } }),
  saveRule: async () => undefined,
};

const messages = mergeMessageCatalogs(
  sharedMessages,
  projectSettingsShellMessages,
  projectSettingsTagsMessages,
  projectPagesMessages,
);

function TagsStoryShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <FeatureMessagesProvider
      locale={DEFAULT_LOCALE}
      messages={messages}
      timeZone={DEFAULT_TIME_ZONE}
    >
      <main className="min-h-screen bg-bg p-4 text-fg sm:p-6">
        <SettingsShell activeSection="tags" projectRef={projectId}>
          {children}
        </SettingsShell>
      </main>
    </FeatureMessagesProvider>
  );
}

const meta = {
  component: SettingsTagsSection,
  parameters: { nextjs: { appDirectory: true } },
  title: "Settings/Tags",
} satisfies Meta<typeof SettingsTagsSection>;

export default meta;

type Story = StoryObj<typeof meta>;

const settledArgs = {
  actions,
  canCreate: true,
  canDelete: true,
  canEdit: true,
  projectId,
  rows,
  sitemaps: ["https://example.com/sitemap.xml"],
} satisfies Story["args"];

export const Mixed: Story = {
  args: settledArgs,
  render: (args) => (
    <TagsStoryShell>
      <SettingsTagsSection {...args} />
    </TagsStoryShell>
  ),
};

export const MergeDialog: Story = {
  args: { ...settledArgs, initialDialog: { row: rows[0], type: "merge" } },
  name: "Merge dialog",
  render: (args) => (
    <TagsStoryShell>
      <SettingsTagsSection {...args} />
    </TagsStoryShell>
  ),
};

export const DeleteDialog: Story = {
  args: { ...settledArgs, initialDialog: { row: rows[0], type: "delete" } },
  name: "Delete dialog",
  render: (args) => (
    <TagsStoryShell>
      <SettingsTagsSection {...args} />
    </TagsStoryShell>
  ),
};
