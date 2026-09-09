import { DataTableDensityMenu } from "@/components/ui/data-table/DataTableDensityMenu";
import { MenuMultiSelect, MenuSelect, type MenuSelectOption } from "@/components/ui/MenuSelect";
import { GlobeIcon } from "@phosphor-icons/react";
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

function InputSizedMenu() {
  const [value, setValue] = useState("draft");
  return (
    <MenuSelect
      ariaLabel="Input-sized menu"
      onChange={setValue}
      options={shortOptions}
      size="input"
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

export const InputSized: Story = {
  name: "Input-sized menu",
  render: () => (
    <div className="flex w-[300px] flex-col gap-2">
      <span className="text-[12.5px] font-semibold text-fg-muted">
        Matches the standard input control height and typography.
      </span>
      <InputSizedMenu />
    </div>
  ),
};

function ContentSizedMenus() {
  const [source, setSource] = useState("all");
  const [density, setDensity] = useState<"compact" | "standard" | "comfortable">("compact");
  const [values, setValues] = useState(["long"]);
  const descriptiveOptions: MenuSelectOption[] = [
    {
      icon: <GlobeIcon aria-hidden size={15} weight="regular" />,
      label: "A very long market label that still needs to remain readable on a narrow screen",
      secondary: "example-with-a-long-unbroken-domain-name-for-layout-checks.example.com",
      trailing: "12",
      value: "long",
    },
    { label: "Other market", value: "other" },
  ];
  return (
    <div className="flex flex-wrap items-start gap-4">
      <MenuSelect
        ariaLabel="Run source"
        onChange={setSource}
        options={[
          { label: "All sources", value: "all" },
          { label: "Rank checks", value: "rank_checks" },
          { label: "Search Console", value: "search_console" },
        ]}
        value={source}
      />
      <DataTableDensityMenu density={density} onDensityChange={setDensity} />
      <MenuSelect
        ariaLabel="Fixed-width menu"
        menuWidth={240}
        onChange={() => undefined}
        options={descriptiveOptions}
        selectedContent={() => "Market"}
        value="long"
      />
      <MenuMultiSelect
        ariaLabel="Long multi-select"
        onChange={setValues}
        options={descriptiveOptions}
        summary={() => "Markets"}
        values={values}
      />
    </div>
  );
}

export const ContentSizing: Story = {
  name: "Content width and readable long labels",
  render: () => <ContentSizedMenus />,
};
