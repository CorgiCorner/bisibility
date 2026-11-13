import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { emptyPageTagForm } from "@/lib/schemas/page-tag";
import pagesMessages from "@/messages/core/en/project-pages.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";
import { PageTagDrawer } from "./PageTagDrawer";

const messages = mergeMessageCatalogs(sharedMessages, pagesMessages);

const meta = {
  component: PageTagDrawer,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
        <Story />
      </FeatureMessagesProvider>
    ),
  ],
  title: "Pages/New tag",
} satisfies Meta<typeof PageTagDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

const preview = fn(async () => ({
  sample: ["/docs", "/docs/guide"],
  total: 7,
  truncated: true,
}));

const base = {
  canWrite: true,
  onClose: fn(),
  open: true,
  options: [{ id: "tag_docs", keywordCount: 4, name: "Docs" }],
  preview,
  save: fn(async () => undefined),
  sitemaps: ["https://example.com/sitemap.xml"],
  title: "New tag",
};

export const PathPattern: Story = {
  args: { ...base, initial: { ...emptyPageTagForm, pattern: "/docs/{slug}", tagName: "Docs" } },
};

export const Sitemap: Story = {
  args: {
    ...base,
    initial: {
      ...emptyPageTagForm,
      kind: "sitemap",
      sitemapUrl: "https://example.com/sitemap.xml",
      tagName: "Docs",
    },
  },
};

export const UrlList: Story = {
  args: {
    ...base,
    initial: {
      ...emptyPageTagForm,
      kind: "url_list",
      tagName: "Docs",
      urlsText: "/docs\n/pricing",
    },
  },
};

export const ByHand: Story = {
  args: { ...base, initial: { ...emptyPageTagForm, kind: "manual", tagName: "Docs" } },
};

export const Phone: Story = {
  args: { ...base, initial: { ...emptyPageTagForm, pattern: "/{slug}", tagName: "" } },
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
