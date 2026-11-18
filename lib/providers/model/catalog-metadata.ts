import { PROVIDER_ALLOCATION_METADATA } from "@/lib/providers/runtime-allocation-metadata";
import type { ProviderCatalogEntry } from "@/lib/providers/types";

const providers = [
  {
    id: "openai",
    label: "OpenAI",
    logoDomain: "openai.com",
    accountUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    logoDomain: "anthropic.com",
    accountUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    logoDomain: "openrouter.ai",
    accountUrl: "https://openrouter.ai/settings/keys",
  },
  {
    id: "vercel_ai_gateway",
    label: "Vercel AI Gateway",
    logoDomain: "vercel.com",
    accountUrl: "https://vercel.com/dashboard/ai-gateway",
  },
] as const;

/** Display metadata is independent of adapter registration and generation readiness. */
export const MODEL_PROVIDER_CATALOG = providers.map((provider) => ({
  ...provider,
  allocation: PROVIDER_ALLOCATION_METADATA[provider.id],
  kind: "model" as const,
  defaultStatus: "ready" as const,
  requiredCredentials: ["apiKey"] as const,
  billingNotice: "Billed by your provider" as const,
})) satisfies ProviderCatalogEntry[];
