import { countryValueForCode } from "@/components/keywords/location-picker-data";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import { MarketPicker } from "./MarketPicker";

const spain = countryValueForCode("ES");
if (!spain) throw new Error("Spain story fixture is missing.");

const meta = {
  component: MarketPicker,
  decorators: [
    (Story) => (
      <div className="min-h-[680px] bg-bg p-6 text-fg">
        <div className="mx-auto max-w-[620px]">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Markets/MarketPicker",
} satisfies Meta<typeof MarketPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

const baseArgs = {
  initialLocation: spain,
  maxMarkets: 5,
  onCommit: () => undefined,
  projectId: "prj_story",
  trackedCanonicalKeys: [],
} satisfies Story["args"];

export const Spain: Story = {
  args: { ...baseArgs, calculatorHref: "/pricing#calculator" },
};

export const SpainWithTrackedDefault: Story = {
  args: { ...baseArgs, trackedCanonicalKeys: ["ES"] },
};

/** Both groups labelled, each alphabetical, the whole committed catalog behind one scroll. */
export const AllLanguagesExpanded: Story = {
  args: baseArgs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "More languages" }));
    await expect(canvas.getByText("ALL LANGUAGES")).toBeVisible();
  },
};

/** Search narrows the full group; the suggested group keeps its own header above it. */
export const SearchingAllLanguages: Story = {
  args: baseArgs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "More languages" }));
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Search more languages" }),
      "Vietnamese",
    );
    await expect(canvas.getByRole("button", { name: /Vietnamese/ })).toBeVisible();
  },
};

/** Off catalog: terse suffix on the row, the whole sentence once under the selection. */
export const OffCatalogLanguageSelected: Story = {
  args: baseArgs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "More languages" }));
    await userEvent.type(canvas.getByRole("textbox", { name: "Search more languages" }), "English");
    await userEvent.click(canvas.getByRole("button", { name: /English.*no volume\/KD/ }));
    await expect(
      canvas.getByText(
        "English: no search volume or difficulty data for this market - positions are tracked normally.",
      ),
    ).toBeVisible();
  },
};
