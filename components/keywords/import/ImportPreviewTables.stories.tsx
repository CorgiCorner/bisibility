import type { KeywordImportColumnMapping } from "@/lib/keywords/import-csv-parser";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ImportColumnMapping } from "./ImportColumnMapping";
import { ParsedRowsPreview } from "./ParsedRowsPreview";

const sourceColumns = ["keyword", "target_url", "tags", "country", "language", "device"].map(
  (label, index) => ({ index, label }),
);

const previewRows = [
  {
    city: "Austin",
    device: "desktop",
    intent: "commercial",
    keyword: "rank tracker",
    language: "en",
    location: "US",
    locationKey: "US/Texas/Austin",
    row: 2,
    tags: ["Core", "SEO"],
    targetUrl: "/rank",
    topic: "Product",
  },
  {
    device: "mobile",
    keyword: "mobile serp",
    language: "en",
    location: "GB",
    row: 3,
    tags: ["Product"],
    targetUrl: "/mobile",
  },
];

const largePreviewRows = Array.from({ length: 1_000 }, (_, index) => ({
  city: index % 2 === 0 ? "Austin" : "London",
  device: index % 2 === 0 ? "desktop" : "mobile",
  keyword: `import preview keyword ${index + 1}`,
  language: "en",
  location: index % 2 === 0 ? "US" : "GB",
  row: index + 2,
  tags: index % 3 === 0 ? ["Imported"] : [],
  targetUrl: `/landing-${index + 1}`,
}));

const meta = {
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Keywords/Import/Preview tables",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ParsedPreview: Story = {
  render: () => <ParsedRowsPreview rows={previewRows} />,
};

export const LargeParsedPreview: Story = {
  render: () => <ParsedRowsPreview rows={largePreviewRows} />,
};

function ColumnMappingStory() {
  const [mapping, setMapping] = useState<KeywordImportColumnMapping>({
    device: 5,
    keyword: 0,
    language: 4,
    location: 3,
    tags: 2,
    targetUrl: 1,
  });
  return (
    <ImportColumnMapping
      mapping={mapping}
      onChange={(sourceIndex, destination) => {
        setMapping((current) => {
          const next = Object.fromEntries(
            Object.entries(current).filter(
              ([field, index]) => index !== sourceIndex && field !== destination,
            ),
          ) as KeywordImportColumnMapping;
          return destination ? { ...next, [destination]: sourceIndex } : next;
        });
      }}
      sourceColumns={sourceColumns}
    />
  );
}

export const ColumnMapping: Story = {
  render: () => <ColumnMappingStory />,
};
