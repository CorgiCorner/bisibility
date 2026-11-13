import { PROVIDER_CATALOG } from "@/lib/providers/catalog-metadata";

const ENGINE_KEYS = {
  chat_gpt: "chatGpt",
  claude: "claude",
  gemini: "gemini",
  google: "google",
  perplexity: "perplexity",
} as const;

export type OverviewEngineCopy = {
  chatGpt: string;
  claude: string;
  gemini: string;
  google: string;
  perplexity: string;
};

type EngineMessageKey =
  | "overview.engineChatGpt"
  | "overview.engineClaude"
  | "overview.engineGemini"
  | "overview.engineGoogle"
  | "overview.enginePerplexity";

export function overviewEngineCopy(
  translate: (key: EngineMessageKey) => string,
): OverviewEngineCopy {
  return {
    chatGpt: translate("overview.engineChatGpt"),
    claude: translate("overview.engineClaude"),
    gemini: translate("overview.engineGemini"),
    google: translate("overview.engineGoogle"),
    perplexity: translate("overview.enginePerplexity"),
  };
}

export function overviewEngineLabel(engine: string, labels: OverviewEngineCopy) {
  const key = ENGINE_KEYS[engine as keyof typeof ENGINE_KEYS];
  return key ? labels[key] : engine;
}

export function overviewProviderLabel(provider: string) {
  return PROVIDER_CATALOG.find((entry) => entry.id === provider)?.label ?? provider;
}

export function overviewList(locale: string, values: readonly string[]) {
  if (!values.length) return "";
  return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format([...values]);
}
