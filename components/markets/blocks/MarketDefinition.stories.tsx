import type { Meta, StoryObj } from "@storybook/react";
import { MarketDefinition, type MarketDefinitionLocationSource } from "./MarketDefinition";

const countries = [
  { code: "BE", label: "Belgium" },
  { code: "ES", label: "Spain" },
];

const languages: Record<string, { code: string; label: string }[]> = {
  BE: [
    { code: "nl", label: "Dutch" },
    { code: "fr", label: "French" },
  ],
  ES: [
    { code: "es", label: "Spanish" },
    { code: "ca", label: "Catalan" },
  ],
};

const places = [
  {
    canonicalKey: "ES/Andalusia",
    countryCode: "ES",
    displayName: "Andalusia, Spain",
    kind: "region" as const,
  },
  {
    canonicalKey: "ES/Andalusia/Malaga",
    countryCode: "ES",
    displayName: "Malaga, Andalusia, Spain",
    kind: "city" as const,
  },
];

/** A canned source: the story never reaches the location search. */
const source: MarketDefinitionLocationSource = {
  countries,
  languagesFor: (countryCode) => ({
    all: [...(languages[countryCode] ?? []), { code: "en", label: "English" }],
    suggested: languages[countryCode] ?? [],
  }),
  searchLocations: async (query, countryCode) =>
    countryCode === "ES"
      ? places.filter((place) => place.displayName.toLowerCase().includes(query.toLowerCase()))
      : [],
};

const meta = {
  component: MarketDefinition,
  decorators: [
    (Story) => (
      <div className="max-w-md bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  title: "Markets/Blocks/MarketDefinition",
} satisfies Meta<typeof MarketDefinition>;

export default meta;
type Story = StoryObj<typeof meta>;

const base = { onChange: () => {}, registry: [], source };
const spain = {
  canonicalKey: "ES",
  countryCode: "ES",
  displayName: "Spain",
  kind: "country" as const,
};

export const Empty: Story = {
  args: {
    ...base,
    duplicate: null,
    value: { countryCode: null, customName: "", languageCode: null, location: null },
  },
};

export const Disabled: Story = { args: Empty.args };

export const DuplicateActive: Story = {
  args: {
    ...base,
    duplicate: { label: "Spain / Spanish", state: "active" },
    value: { countryCode: "ES", customName: "", languageCode: "es", location: spain },
  },
};

export const DuplicateArchived: Story = {
  args: {
    ...base,
    duplicate: { label: "Spain / Spanish", state: "archived" },
    value: { countryCode: "ES", customName: "", languageCode: "es", location: spain },
  },
};

export const Multilingual: Story = {
  args: {
    ...base,
    duplicate: null,
    value: {
      countryCode: "BE",
      customName: "",
      languageCode: "nl",
      location: { canonicalKey: "BE", countryCode: "BE", displayName: "Belgium", kind: "country" },
    },
  },
};

export const CityWithType: Story = {
  args: {
    ...base,
    duplicate: null,
    value: { countryCode: "ES", customName: "", languageCode: "en", location: places[1] },
  },
};

export const LongName: Story = {
  args: {
    ...base,
    duplicate: null,
    value: {
      countryCode: "ES",
      customName: "A very long market name that demonstrates the shared input handling",
      languageCode: "es",
      location: spain,
    },
  },
};
