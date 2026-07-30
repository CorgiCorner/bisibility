import { KeywordsScopeControls } from "@/components/keywords/KeywordsScopeControls";
import type { LensLocationOption } from "@/lib/keywords/lens-model";
import { appPath } from "@/lib/routing/app-path";
import type { Meta, StoryObj } from "@storybook/react";

const locationOptions: LensLocationOption[] = [
  { count: 42, displayName: "United States", id: "loc_us", kind: "country" },
  { count: 12, displayName: "Austin, Texas, United States", id: "loc_austin", kind: "city" },
  { count: 8, displayName: "United Kingdom", id: "loc_gb", kind: "country" },
];

const meta = {
  title: "Keywords/ScopeControls",
  component: KeywordsScopeControls,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="min-h-[140px] bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof KeywordsScopeControls>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AllLocations: Story = {
  args: {
    basePath: appPath("prj_1", "keywords"),
    lens: { device: "all", locationId: null },
    locationOptions,
  },
};

export const CityMobile: Story = {
  args: {
    basePath: appPath("prj_1", "keywords"),
    lens: { device: "mobile", locationId: "loc_austin" },
    locationOptions,
  },
};
