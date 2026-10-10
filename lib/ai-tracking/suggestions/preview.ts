import "server-only";
import { fetchAiResearchCapabilities } from "@/lib/ai-research/catalog";
import type { AiResearchContext } from "@/lib/ai-research/service";
import { trackingAdmissionContext } from "@/lib/ai-tracking/admission/context";
import { payloadHash } from "@/lib/ai-tracking/identity";
import { resolveTrackingConnection } from "@/lib/ai-tracking/queries/connections";
import { prisma } from "@/lib/db/prisma";
import { requirePublicId } from "@/lib/db/public-id-resources";
import { preflightProviderBudget } from "@/lib/provider-lookups/paid-call-budget";
import { surfaceOf } from "@/lib/provider-usage/surface";
import {
  modelSuggestionsPreviewInputSchema,
  SuggestionGenerationError,
  type SuggestionGenerationPreview,
} from "./generation-schema";
import { forecastGeneration, GENERATION_LIMITATIONS } from "./model-forecast";

export async function prepareSuggestionPreview(context: AiResearchContext, rawInput: unknown) {
  const input = modelSuggestionsPreviewInputSchema.parse(rawInput);
  let connectionId: string | undefined;
  if (input.credentialConnectionId) {
    const connection = await resolveTrackingConnection(
      context.projectId,
      input.credentialConnectionId,
    );
    if (!connection)
      throw new SuggestionGenerationError(
        422,
        "own_credentials_required",
        "The selected project provider connection is unavailable.",
      );
    if (
      !connection.enabled ||
      connection.status !== "connected" ||
      connection.provider !== "dataforseo"
    )
      throw new SuggestionGenerationError(
        422,
        "own_credentials_required",
        "The reviewed own-provider connection is disabled or disconnected.",
      );
    connectionId = connection.id;
  }
  const source = await trackingAdmissionContext(context.projectId, connectionId).catch(
    (error: unknown) => {
      if (
        error instanceof Error &&
        /^(?:Connect an enabled own|Stored tracking credential|Tracking requires a versioned)/.test(
          error.message,
        )
      )
        throw new SuggestionGenerationError(
          422,
          "own_credentials_required",
          "Connect a usable, versioned own DataForSEO credential before reviewing generation.",
        );
      throw error;
    },
  );
  const competitors = await prisma.competitor.findMany({
    where: {
      projectId: context.projectId,
      publicId: { in: input.inputSnapshot.competitors.map((item) => item.id) },
    },
    select: { publicId: true, label: true, domain: true },
  });
  for (const selected of input.inputSnapshot.competitors) {
    const current = competitors.find((item) => item.publicId === selected.id);
    if (
      !current ||
      current.domain !== selected.domain ||
      (current.label ?? current.domain) !== (selected.label ?? selected.domain)
    )
      throw new SuggestionGenerationError(
        409,
        "reviewed_context_changed",
        "A selected competitor changed. Review its current label and domain before generating.",
      );
  }
  const capabilities = await fetchAiResearchCapabilities(source.credentials, Date.now() + 10000);
  const forecast = forecastGeneration(input.configuration, input.inputSnapshot, capabilities);
  await preflightProviderBudget({
    projectId: context.projectId,
    connectionId: source.connection.id,
    provider: "dataforseo",
    estimatedCostCents: forecast.estimatedCostCents,
    surface: surfaceOf(context.origin.source),
  });
  const snapshotHash = payloadHash(input.inputSnapshot);
  const credentialConnectionId = requirePublicId(source.connection.publicId, "conn");
  const consentRevision = payloadHash([
    "suggestion-generation-consent-v1",
    input.configuration,
    snapshotHash,
    credentialConnectionId,
    source.credentialVersion,
    source.budgetRevision,
    forecast.pricingRevision,
    forecast.estimatedCostCents,
  ]);
  const preview: SuggestionGenerationPreview = {
    version: 1,
    ...input,
    snapshotHash,
    credentialConnectionId,
    credentialVersion: source.credentialVersion,
    budgetRevision: source.budgetRevision,
    consentRevision,
    estimatedCostCents: forecast.estimatedCostCents,
    estimateKind: "forecast",
    isGuaranteedMaximum: false,
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    limitations: [...GENERATION_LIMITATIONS],
  };
  return { preview, source, forecast, capabilities };
}
