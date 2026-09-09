import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { MarketsPageContent } from "./MarketsPageContent";

const projectId = `prj_${"a".repeat(24)}`;
const initialMarket = {
  activeKeywordCount: 0,
  canonicalKey: "US",
  countryCode: "US",
  displayName: "United States",
  id: `pmkt_${"b".repeat(24)}`,
  keywordCount: 0,
  languageCode: "en",
  languageLabel: "English",
  monthlyCostCents: 0,
  name: "United States",
  researchAvailable: true,
  status: "active",
} satisfies ProjectMarketsView["markets"][number];

function MarketLifecycle() {
  const [market, setMarket] = useState<ProjectMarketsView["markets"][number]>(initialMarket);
  return (
    <div className="p-6">
      <MarketsPageContent
        addKeywordsAction={async () => ({ created: 0, keywords: [] })}
        archivedMarkets={{ markets: [], projectId }}
        canAddKeywords
        canArchive
        canEdit
        canRestore
        markets={{
          markets: [market],
          maxMarkets: 5,
          monthlyCostCents: 0,
          perMarketChecks: 0,
          projectId,
        }}
        onArchive={async () => {}}
        onRestore={async () => {}}
        onSave={async () => {}}
        onStatusChange={async ({ enabled }) => {
          const status = enabled ? "active" : "paused";
          setMarket((current) => ({ ...current, status }));
          return { status };
        }}
      />
    </div>
  );
}

const meta = {
  component: MarketLifecycle,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  title: "Markets/Page/Lifecycle",
} satisfies Meta<typeof MarketLifecycle>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PauseAndResume: Story = {};
