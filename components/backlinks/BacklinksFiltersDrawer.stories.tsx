import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import messages from "@/messages/core/en/project-backlinks.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { BacklinksFiltersDrawer } from "./BacklinksFiltersDrawer";
import { emptyBacklinksFilters } from "./backlinks-filters-model";

const meta = {
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        timeZone="UTC"
        messages={mergeMessageCatalogs(sharedMessages, messages)}
      >
        <Story />
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Backlinks/Filters",
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function FiltersExample() {
  const [draft, setDraft] = useState(emptyBacklinksFilters);
  return (
    <BacklinksFiltersDrawer
      draft={draft}
      linkTypeCounts={{ dofollow: 10, image: 2, nofollow: 3, sitewide: 0, sponsored: 0, ugc: 1 }}
      onApply={() => {}}
      onChange={setDraft}
      onClose={() => {}}
      open
      resultCount={12}
    />
  );
}

export const Open: Story = {
  render: () => <FiltersExample />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const minimum = await page.findByRole("slider", { name: "Domain authority minimum" });
    const track = minimum
      .closest('[role="dialog"]')
      ?.querySelector('[data-slot="slider-track"]') as HTMLElement;
    expect(track.getBoundingClientRect().width).toBeGreaterThan(200);
    expect(track.getBoundingClientRect().height).toBeGreaterThanOrEqual(4);
    minimum.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(minimum).toHaveAttribute("aria-valuenow", "1");
    await userEvent.click(page.getByRole("radio", { name: "30 days" }));
    expect(page.getByRole("radio", { name: "30 days" })).toBeChecked();
  },
};
