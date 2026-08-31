import { ToastProvider } from "@/components/ui";
import type { LoadSearchInsightsPropertiesAction } from "@/lib/actions/search-insights";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { SearchInsightsPropertyPicker } from "./SearchInsightsPropertyPicker";
import {
  storyContext,
  storyLoadPropertiesAction,
  storyProperties,
  storySelectPropertyAction,
} from "./search-insights-story-fixtures";

const reauthAction = (async () => ({
  archived: [],
  properties: [],
  requiresReauth: true,
})) as LoadSearchInsightsPropertiesAction;

const meta = {
  args: {
    connection: storyContext.connection,
    loadPropertiesAction: storyLoadPropertiesAction,
    projectDomain: storyContext.projectDomain,
    projectId: "prj_story",
    selectPropertyAction: storySelectPropertyAction,
  },
  component: SearchInsightsPropertyPicker,
  decorators: [
    (Story) => (
      <ToastProvider>
        <div className="bg-bg p-6 text-fg">
          <Story />
        </div>
      </ToastProvider>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Search Console/Property picker",
} satisfies Meta<typeof SearchInsightsPropertyPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DomainProperty: Story = {};

export const UrlPrefixProperty: Story = {
  args: {
    connection: {
      property: {
        displayName: "https://blog.example.com/",
        kind: "url-prefix",
        kindLabel: "url prefix",
        value: "https://blog.example.com/",
      },
      status: "connected",
    },
  },
};

export const NoPropertyConnected: Story = {
  args: { connection: { property: null, status: "not_connected" } },
};

const activeOnlyAction = (async () => ({
  archived: [],
  properties: [storyProperties[0]],
})) as LoadSearchInsightsPropertiesAction;

async function assertOpenMenuGeometry(canvasElement: HTMLElement) {
  await userEvent.click(
    within(canvasElement).getByRole("button", { name: "Search Console property" }),
  );

  const body = within(canvasElement.ownerDocument.body);
  const button = await body.findByRole("button", { name: "Change property" });
  const option = body.getByRole("option", { name: /example\.com/i });
  const activeHeadings = body.getAllByText("Active", { exact: true });
  expect(activeHeadings).toHaveLength(1);
  const activeHeading = activeHeadings[0];
  expect(activeHeading.nextElementSibling).toBe(option);
  expect(option).not.toHaveTextContent("Active");
  const footer = button.closest('[data-slot="menu-action-footer"]');
  const divider = footer?.querySelector('[data-slot="menu-action-footer-divider"]');
  const paper = footer?.closest(".MuiPaper-root");
  if (
    !(
      footer instanceof HTMLElement &&
      divider instanceof HTMLElement &&
      paper instanceof HTMLElement
    )
  ) {
    throw new Error("Menu action footer geometry nodes are missing.");
  }

  const initialOptionRect = option.getBoundingClientRect();
  const dividerRect = divider.getBoundingClientRect();
  const paperRect = paper.getBoundingClientRect();
  const paperStyle = getComputedStyle(paper);
  const innerTop = paperRect.top + Number.parseFloat(paperStyle.borderTopWidth);
  const topGap = activeHeading.getBoundingClientRect().top - innerTop;
  const bottomGap = dividerRect.top - initialOptionRect.bottom;
  expect(topGap).toBeCloseTo(6, 1);
  expect(bottomGap).toBeCloseTo(6, 1);
  expect(Math.abs(topGap - bottomGap)).toBeLessThanOrEqual(1);
  expect(dividerRect.left).toBeCloseTo(
    paperRect.left + Number.parseFloat(paperStyle.borderLeftWidth),
    1,
  );
  expect(dividerRect.right).toBeCloseTo(
    paperRect.right - Number.parseFloat(paperStyle.borderRightWidth),
    1,
  );

  await userEvent.hover(option);
  option.focus();
  const interactiveOptionRect = option.getBoundingClientRect();
  expect(interactiveOptionRect.top).toBeCloseTo(initialOptionRect.top, 4);
  expect(interactiveOptionRect.bottom).toBeCloseTo(initialOptionRect.bottom, 4);
  expect(interactiveOptionRect.width).toBeCloseTo(initialOptionRect.width, 4);

  const buttonRect = button.getBoundingClientRect();
  const listStyle = getComputedStyle(footer.parentElement ?? footer);
  const footerStyle = getComputedStyle(footer);
  const innerBottom = paperRect.bottom - Number.parseFloat(paperStyle.borderBottomWidth);
  const dividerToButton = buttonRect.top - dividerRect.bottom;
  const buttonToBottom = innerBottom - buttonRect.bottom;
  const expectedButtonToBottom =
    dividerToButton +
    Number.parseFloat(paperStyle.paddingBottom) +
    Number.parseFloat(listStyle.paddingBottom) +
    Number.parseFloat(footerStyle.marginBottom);

  expect(buttonToBottom).toBeCloseTo(expectedButtonToBottom, 4);
  expect(Math.abs(dividerToButton - buttonToBottom)).toBeLessThanOrEqual(1);
}

export const MenuOpen: Story = {
  play: async ({ canvasElement }) => {
    await assertOpenMenuGeometry(canvasElement);

    const body = within(canvasElement.ownerDocument.body);
    const listbox = body.getByRole("listbox");
    const headers = listbox.querySelectorAll('[data-slot="menu-group-header"]');
    expect([...headers].map((header) => header.textContent)).toEqual([
      "Active",
      "Matches this project",
    ]);
    expect(headers[0]).toHaveStyle({ marginTop: "0px" });
    expect(headers[1]).toHaveStyle({ marginTop: "4px" });
    expect(listbox.querySelector('[data-slot="property-group-divider"]')).toBeNull();
  },
};

export const ActiveOnlyMenu: Story = {
  args: { loadPropertiesAction: activeOnlyAction },
  play: async ({ canvasElement }) => {
    await assertOpenMenuGeometry(canvasElement);
  },
};

export const ReconnectNeeded: Story = {
  args: { loadPropertiesAction: reauthAction },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Search Console property" }),
    );
  },
};
const overlappingArchivedAction = (async () => ({
  archived: [
    {
      displayName: "example.com",
      kind: "domain",
      kindLabel: "domain",
      lastSyncedDate: "Aug 20, 2026",
      value: "sc-domain:example.com",
    },
  ],
  properties: storyProperties,
})) as LoadSearchInsightsPropertiesAction;

export const OverlappingActiveArchivedAndLive: Story = {
  args: { loadPropertiesAction: overlappingArchivedAction },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Search Console property" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    expect(body.getAllByRole("option", { name: /example\.com/i })).toHaveLength(1);
    expect(body.getByRole("link", { name: "Connection settings" })).toHaveAttribute(
      "href",
      "/app/prj_story/integrations?connect=gsc#provider-gsc",
    );
  },
};

const otherPropertyAction = (async () => ({
  archived: [],
  properties: [
    ...storyProperties,
    {
      displayName: "https://unrelated.example.org/",
      kind: "url-prefix",
      kindLabel: "url prefix",
      permissionLevel: "siteFullUser",
      value: "https://unrelated.example.org/",
    },
  ],
})) as LoadSearchInsightsPropertiesAction;

export const OtherPropertyInChangeModalOnly: Story = {
  args: { loadPropertiesAction: otherPropertyAction },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Search Console property" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const listbox = body.getByRole("listbox");
    expect(
      within(listbox).queryByText("Other properties on this account", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      within(listbox).queryByRole("option", { name: /unrelated\.example\.org/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(body.getByRole("button", { name: "Change property" }));
    const dialog = body.getByRole("dialog", { name: "Change Search Console property" });
    expect(
      within(dialog).getByText("Other properties on this account", { exact: true }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getAllByRole("button", { name: /unrelated\.example\.org/i }),
    ).toHaveLength(1);
  },
};
