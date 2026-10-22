import "server-only";
import { resolveProviderPayment } from "@/lib/action-payment/provider-descriptor";
import { type ActionPaymentInput, prepareActionPayment } from "@/lib/action-payment/session";
import type { ProviderRequestOrigin } from "@/lib/provider-usage/surface";
import type { KeywordResearchProject } from "./context";
import { estimateKeywordResearch } from "./execution";
import type { ResearchSelection } from "./source-call";

export async function prepareResearchPayment(
  input: ActionPaymentInput & {
    actorId?: string | null;
    origin: ProviderRequestOrigin;
    fresh?: boolean;
    includeClickstream: boolean;
    mode: Parameters<typeof estimateKeywordResearch>[0]["mode"];
    resultLimit: number;
    seed: string;
  },
  project: KeywordResearchProject,
  selected: ResearchSelection,
  estimateInput: Omit<Parameters<typeof estimateKeywordResearch>[0], "selected">,
) {
  if (
    !resolveProviderPayment(selected.provider, "keyword_research") &&
    !input.acceptedPayment &&
    !input.requirePayment
  )
    return null;
  const estimate = await estimateKeywordResearch({ ...estimateInput, selected });
  return prepareActionPayment({
    ...input,
    projectId: project.id,
    ownerId: project.ownerId,
    connection: selected.connection,
    provider: selected.provider,
    source: input.origin.source,
    feature: "keyword_research",
    lookupCacheTtlSeconds: project.lookupCacheTtlSeconds,
    request: [
      input.seed.trim().replace(/\s+/g, " ").toLowerCase(),
      estimateInput.location.gl,
      estimateInput.location.hl,
      input.includeClickstream,
      input.mode,
      input.resultLimit,
      input.fresh ?? false,
    ],
    children: estimate.sources.map((source) => ({
      key: source.source,
      costCents: source.costCents,
      quantity: input.resultLimit,
      cached: source.cached,
      freeUntil: source.freeUntil,
    })),
  });
}
