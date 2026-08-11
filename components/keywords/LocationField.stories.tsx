import { LocationField, type LocationFieldValue } from "@/components/keywords/LocationField";
import { countryValueForName } from "@/components/keywords/location-picker-data";
import { FIELD_HELP } from "@/lib/settings/field-help";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

const LOCATION_FIXTURE = [
  {
    canonical_key: "US/Texas/Austin",
    city_name: "Austin",
    country_code: "US",
    display_name: "Austin, Texas, United States",
    id: "location:US/Texas/Austin",
    kind: "city",
    region_name: "Texas",
  },
  {
    canonical_key: "US/Massachusetts/Boston",
    city_name: "Boston",
    country_code: "US",
    display_name: "Boston, Massachusetts, United States",
    id: "location:US/Massachusetts/Boston",
    kind: "city",
    region_name: "Massachusetts",
  },
  {
    canonical_key: "ES",
    city_name: null,
    country_code: "ES",
    display_name: "Spain",
    hl: "es",
    kind: "country",
    language_label: "Spanish",
    region_code: null,
    region_name: null,
  },
];

function country(name = "United States") {
  const value = countryValueForName(name);
  if (!value) {
    throw new Error(`Missing story country: ${name}`);
  }
  return value;
}

function installFetchStub() {
  const original = window.fetch;
  window.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes("/api/locations/search")) {
      return new Response(JSON.stringify({ data: LOCATION_FIXTURE }), {
        headers: { "content-type": "application/json" },
      });
    }
    return original(input);
  }) as typeof window.fetch;
}

function FieldHarness({ initial = country() }: { initial?: LocationFieldValue }) {
  const [value, setValue] = useState<LocationFieldValue>(initial);
  return (
    <LocationField
      help={FIELD_HELP.location}
      onChange={setValue}
      projectId="prj_demo"
      value={value}
    />
  );
}

const meta = {
  title: "Keywords/LocationField",
  component: LocationField,
  args: {
    onChange: () => undefined,
    value: country(),
  },
  decorators: [
    (Story) => {
      installFetchStub();
      return (
        <div className="min-h-[260px] max-w-[420px] bg-bg-elev p-6 text-fg">
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof LocationField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Country: Story = {
  render: () => <FieldHarness />,
};

export const City: Story = {
  render: () => (
    <FieldHarness
      initial={{
        canonicalKey: "US/Texas/Austin",
        cityName: "Austin",
        countryCode: "US",
        displayName: "Austin, Texas, United States",
        kind: "city",
        regionName: "Texas",
      }}
    />
  ),
};
