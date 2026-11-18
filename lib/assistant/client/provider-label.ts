import type { AssistantProvider } from "@/lib/assistant/wire";

/** Display names for the direct providers; identifiers stay lowercase on the wire. */
export const PROVIDER_LABELS: Readonly<Record<AssistantProvider, string>> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  openrouter: "OpenRouter",
};
