"use client";

import { StatusChip } from "@/components/ui/StatusChip";
import { useTranslations } from "next-intl";

const engineMessage = {
  chat_gpt: "engineChatGpt",
  claude: "engineClaude",
  gemini: "engineGemini",
  perplexity: "enginePerplexity",
} as const;

const modeMessage = {
  auto: "modeAuto",
  ideas: "modeIdeas",
  related: "modeRelated",
  suggestions: "modeSuggestions",
} as const;

export function ModelHistoryMeta({ engines }: Readonly<{ engines: readonly string[] }>) {
  const t = useTranslations("projectAiResearch");
  const labels = engines.map((engine) =>
    engine in engineMessage ? t(engineMessage[engine as keyof typeof engineMessage]) : engine,
  );
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
        {market} · {t(device)}
      </span>
      {aiOverview ? <StatusChip dot={false} label={t("aiOverview")} size="sm" tone="info" /> : null}
    </span>
  );
}

export function KeywordHistoryMeta({ mode, scope }: Readonly<{ mode: string; scope: string }>) {
  const t = useTranslations("projectResearch.search");
  const label = mode in modeMessage ? t(modeMessage[mode as keyof typeof modeMessage]) : mode;
  return (
    <span>
      {scope} · {label}
    </span>
  );
}

export function engineChipLabel(
  engine: string,
  t: (key: (typeof engineMessage)[keyof typeof engineMessage]) => string,
) {
  return engine in engineMessage ? t(engineMessage[engine as keyof typeof engineMessage]) : engine;
}

export function modeChipLabel(
  mode: string,
  t: (key: (typeof modeMessage)[keyof typeof modeMessage]) => string,
) {
  return mode in modeMessage ? t(modeMessage[mode as keyof typeof modeMessage]) : mode;
}
