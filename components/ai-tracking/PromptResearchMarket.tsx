import { AiEngineIdentity } from "@/components/ai-research/AiEngineIdentity";
import { MarketChip } from "@/components/markets/MarketChip";

/** This dataset currently exposes the fixed market enforced by promptResearchSchema. */
export function PromptResearchMarket() {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2.5" data-prompt-research-market>
      <AiEngineIdentity engine="chat_gpt" />
      <MarketChip
        countryCode="US"
        languageCode="en"
        locationLabel="United States"
        languageLabel="English"
        showFlag
      />
    </div>
  );
}
