"use client";

import { StatusChip } from "@/components/ui/StatusChip";
import { useTranslations } from "next-intl";

export function engineChipLabel(
  engine: string,
  t: ReturnType<typeof useTranslations<"projectAiResearch">>,
) {
  switch (engine) {
    case "chat_gpt":
      return t("engineChatGpt");
    case "claude":
      return t("engineClaude");
    case "gemini":
      return t("engineGemini");
    case "perplexity":
      return t("enginePerplexity");
    default:
      return engine;
  }
}

export function modeChipLabel(
  mode: string,
  t: ReturnType<typeof useTranslations<"projectResearch.search">>,
) {
  switch (mode) {
    case "auto":
      return t("modeAuto");
    case "ideas":
      return t("modeIdeas");
    case "related":
      return t("modeRelated");
    case "suggestions":
      return t("modeSuggestions");
    default:
      return mode;
  }
}

export function ModelHistoryMeta({ engines }: Readonly<{ engines: readonly string[] }>) {
  const t = useTranslations("projectAiResearch");
  const labels = engines.map((engine) => engineChipLabel(engine, t));
  return <span>{labels.join(", ")}</span>;
}

export function SerpHistoryMeta({
  aiOverview,
  device,
  market,
}: Readonly<{ aiOverview: boolean; device: "desktop" | "mobile"; market: string }>) {
  const t = useTranslations("researchHistory");
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
      <span>
        {market} · {device === "mobile" ? t("mobile") : t("desktop")}
      </span>
      {aiOverview ? <StatusChip dot={false} label={t("aiOverview")} size="sm" tone="info" /> : null}
    </span>
  );
}

export function KeywordHistoryMeta({ mode, scope }: Readonly<{ mode: string; scope: string }>) {
  const t = useTranslations("projectResearch.search");
  return (
    <span>
      {scope} · {modeChipLabel(mode, t)}
    </span>
  );
}
