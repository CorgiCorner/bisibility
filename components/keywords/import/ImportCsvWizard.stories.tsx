import type { Meta, StoryObj } from "@storybook/react";
import { ImportCsvWizard } from "./ImportCsvWizard";
import { ImportCsvWizardFrame } from "./ImportCsvWizardFrame";
import { ReviewStep } from "./ImportCsvWizardPanels";

const projectId = `prj_${"a".repeat(24)}`;
const markets = [
  {
    canonicalKey: "ES@en",
    displayName: "Spain",
    languageLabel: "English",
    name: "Spain launch",
    id: "pmkt_es",
    status: "paused" as const,
  },
  {
    canonicalKey: "PL",
    displayName: "Poland",
    languageLabel: "Polish",
    id: "pmkt_pl",
    status: "active" as const,
  },
];
const meta = {
  title: "Keywords/ImportCsvWizard",
  component: ImportCsvWizard,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  args: { open: true, onClose: () => undefined, projectId, marketContext: { markets } },
} satisfies Meta<typeof ImportCsvWizard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ProjectMarkets: Story = {};
export const PausedMarket: Story = {
  args: { marketContext: { markets, initialMarketKey: "ES@en" } },
};
export const NoMarkets: Story = { args: { marketContext: { markets: [] } } };
export const ReviewMarkets: Story = {
  render: () => (
    <ImportCsvWizardFrame
      footer={null}
      marketContext={{ markets }}
      onClose={() => undefined}
      onMarketChange={() => undefined}
      open
      pending={false}
      projectId={projectId}
      selectedMarketKey={null}
      step={4}
    >
      <ReviewStep
        parsedCount={3}
        review={{
          duplicateRows: 0,
          received: 3,
          rows: [
            {
              keyword: "rank tracker",
              row: 2,
              marketName: "Spain launch",
              marketStatus: "paused",
              location: "Spain",
              language: "en",
              locationKey: "ES@en",
              device: "desktop",
            },
            {
              keyword: "seo monitoring",
              row: 3,
              marketName: "Poland / Polish",
              marketStatus: "active",
              location: "Poland",
              language: "pl",
              locationKey: "PL",
              device: "mobile",
            },
          ],
          errors: [
            {
              row: 4,
              message: "Market GB is not tracked by this project. Add it in Markets first.",
            },
          ],
        }}
      />
    </ImportCsvWizardFrame>
  ),
};
