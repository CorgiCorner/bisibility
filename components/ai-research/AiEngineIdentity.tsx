"use client";

import { ProviderLogo } from "@/components/ui/ProviderLogo";
import { aiEngineLabel } from "@/lib/ai-research/engine-labels";

const domains: Readonly<Record<string, string>> = {
  chat_gpt: "chatgpt.com",
  google: "google.com",
  google_aio: "google.com",
  gemini: "gemini.google.com",
  claude: "claude.ai",
  perplexity: "perplexity.ai",
};

export function AiEngineIdentity({ engine }: Readonly<{ engine: string }>) {
  const label = aiEngineLabel(engine);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-ui-xs" data-ai-engine={engine}>
      <span aria-hidden>
        <ProviderLogo
          alt={label}
          domain={domains[engine]}
          fallbackIcon="globe"
          size="xs"
          tint="var(--fg-muted)"
        />
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}
