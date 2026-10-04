import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { domainOverviewFeatureTestMessages } from "@/i18n/test-support/feature-test-messages";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { DomainOverviewKeywordsTable } from "./DomainOverviewKeywordsTable";
import { domainOverviewReportFixture } from "./fixtures";

const keywords = domainOverviewReportFixture.keywords;
if (!keywords.ok) throw new Error("Keyword fixture must be available");

const page = {
  ...keywords.data,
  rows: ["ai writing assistant", "app development tools", "artificial intelligence software"].map(
    (keyword, index) => ({ ...keywords.data.rows[index], keyword }),
  ),
};

const meta = {
  component: DomainOverviewKeywordsTable,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={domainOverviewFeatureTestMessages}
        timeZone="UTC"
      >
        <div className="bg-bg p-4 text-fg">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Domain Overview/Keywords Table",
} satisfies Meta<typeof DomainOverviewKeywordsTable>;

export default meta;
type Story = StoryObj<typeof meta>;

const checkColumnLayout: NonNullable<Story["play"]> = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const rows = canvas.getAllByTestId("domain-keyword-row");
  const header = rows[0].parentElement?.firstElementChild;
  if (!(header instanceof HTMLElement)) throw new Error("Expected the keyword table header");
  for (const row of [header, ...rows]) {
    const tracks = getComputedStyle(row).gridTemplateColumns.split(" ");
    await expect(tracks).toHaveLength(row.children.length);
  }
  for (const keyword of page.rows) {
    const label = canvas.getByText(keyword.keyword, { exact: true });
    await expect(label.getBoundingClientRect().width).toBeGreaterThanOrEqual(180);
    await expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
  }
};

export const StoredReadOnly: Story = {
  args: { page, readOnly: true },
  play: checkColumnLayout,
};

export const Editable: Story = {
  args: { page, readOnly: false },
  play: checkColumnLayout,
};

export const ScrolledStoredResults: Story = {
  args: { page: keywords.data, readOnly: true },
  play: async ({ canvasElement }) => {
    const row = within(canvasElement).getAllByTestId("domain-keyword-row")[0];
    const header = row.parentElement?.firstElementChild;
    if (!(header instanceof HTMLElement)) throw new Error("Expected the sticky header");
    const scroller = header.parentElement?.parentElement;
    if (!scroller) throw new Error("Expected the table scroll container");
    scroller.scrollTop = 80;
    const color = getComputedStyle(header).backgroundColor;
    await expect(color).toMatch(/^rgb\(/);
  },
};

const longUrl = `https://example.com/articles/${"keyword-research-and-organic-ranking-".repeat(5)}`;
export const LongRankingUrl: Story = {
  args: {
    page: { ...page, rows: [{ ...page.rows[0], rankingUrl: longUrl }] },
    readOnly: true,
  },
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole("link", { name: longUrl });
    await userEvent.tab();
    link.focus();
    const tooltip = await within(document.body).findByRole("tooltip");
    await expect(tooltip).toHaveTextContent(longUrl);
    await expect(link).toHaveAttribute("href", longUrl);
    const arrow = link.querySelector("svg");
    if (!arrow) throw new Error("Expected the external link icon");
    await expect(arrow.getBoundingClientRect().width).toBeGreaterThan(0);
  },
};
