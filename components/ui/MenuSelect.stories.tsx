import { MenuMultiSelect, MenuSelect, type MenuSelectOption } from "@/components/ui/MenuSelect";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

const shortOptions: MenuSelectOption[] = [
  { label: "Draft", value: "draft" },
  { label: "In review", value: "review" },
  { label: "Published", value: "published" },
];

const longOptions: MenuSelectOption[] = Array.from({ length: 40 }, (_, index) => {
  const padded = String(index + 1).padStart(3, "0");
  return { label: `Option ${padded}`, value: `opt-${padded}` };
});

function ShortMenu() {
  const [value, setValue] = useState("draft");
  return (
    <MenuSelect
      ariaLabel="Short menu"
      onChange={setValue}
      options={shortOptions}
      searchable
      value={value}
    />
  );
}

function LongMenu() {
  const [value, setValue] = useState("opt-001");
  return (
    <MenuSelect
      ariaLabel="Long menu"
      menuWidth={260}
      onChange={setValue}
      options={longOptions}
      searchPlaceholder="Search options..."
      searchable
      value={value}
    />
  );
}

function MultiLongMenu() {
  const [values, setValues] = useState<string[]>(["opt-001"]);
  return (
    <MenuMultiSelect
      ariaLabel="Multi long menu"
      onChange={setValues}
      options={longOptions}
      searchPlaceholder="Search options..."
      searchable
      values={values}
    />
  );
}

const meta = {
  title: "UI/MenuSelect",
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="min-h-[520px] bg-bg p-8 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const SearchableShortAndLong: Story = {
  name: "Searchable short and long menus",
  render: () => (
    <div className="flex items-start gap-10">
      <div className="flex w-[280px] flex-col gap-2">
        <span className="text-[12.5px] font-semibold text-fg-muted">Short menu (3 options)</span>
        <ShortMenu />
      </div>
      <div className="flex w-[300px] flex-col gap-2">
        <span className="text-[12.5px] font-semibold text-fg-muted">
          Long menu (40 options) - compare with the short menu at 4x slow motion to confirm the same
          explicit timing
        </span>
        <LongMenu />
      </div>
    </div>
  ),
};

export const SearchableMultiLong: Story = {
  name: "Searchable multi-select long menu",
  render: () => (
    <div className="flex w-[300px] flex-col gap-2">
      <span className="text-[12.5px] font-semibold text-fg-muted">
        Multi-select with 40 options - search, toggle, close, and reopen rapidly
      </span>
      <MultiLongMenu />
    </div>
  ),
};
