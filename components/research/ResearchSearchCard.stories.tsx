import { ResearchSearchCard } from "@/components/research/ResearchSearchCard";
import type { KeywordResearchMode } from "@/lib/keyword-research/types";
import type { ResearchScope } from "@/lib/research/scope";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

const connectionOptions = [{ label: "DataForSEO", value: "conn_a00000000000000000000000" }];

function ResearchSearchCardStory() {
  const [connectionId, setConnectionId] = useState(connectionOptions[0].value);
  const [includeClickstream, setIncludeClickstream] = useState(false);
  const [scope, setScope] = useState<ResearchScope>({
    countryCode: "US",
    countryName: "United States",
    languageCode: "en",
    languageLabel: "English",
    providerLocationCode: 2840,
    researchAvailable: true,
  });
  const [mode, setMode] = useState<KeywordResearchMode>("auto");
  const [resultLimit, setResultLimit] = useState<100 | 300 | 500>(100);
  const [seeds, setSeeds] = useState(["rank tracker"]);

  return (
    <div className="min-h-screen bg-bg p-4 text-fg sm:p-8">
      <div className="mx-auto w-full max-w-6xl">
        <ResearchSearchCard
          connectionId={connectionId}
          connectionOptions={connectionOptions}
          estimate={{ cached: false, costCents: 3, loading: false }}
          includeClickstream={includeClickstream}
          scope={scope}
          scopes={[scope]}
          mode={mode}
          onConnectionChange={setConnectionId}
          onIncludeClickstreamChange={setIncludeClickstream}
          onLimitChange={setResultLimit}
          onScopeChange={setScope}
          onModeChange={setMode}
          onSeedsChange={setSeeds}
          onSubmit={() => undefined}
          researching={false}
          resultLimit={resultLimit}
          seeds={seeds}
        />
      </div>
    </div>
  );
}

const meta = {
  component: ResearchSearchCardStory,
  parameters: {
    chromatic: { viewports: [390, 1440] },
    layout: "fullscreen",
    viewport: { defaultViewport: "desktop" },
  },
  title: "Research/Search card",
} satisfies Meta<typeof ResearchSearchCardStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
