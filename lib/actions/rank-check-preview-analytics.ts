import {
  readAnalyticsSurfaceFromHeaders,
  readConsentFromCookies,
  trackServerEvent,
} from "@/lib/analytics/server";
import { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import type { RunFirstCheckPreviewResult } from "./rank-check-preview-result";

export async function emitFirstCheckPreviewResult(input: {
  actorId: string;
  projectId: string;
  result: RunFirstCheckPreviewResult;
  startedAt: number;
}): Promise<void> {
  try {
    const surface = await readAnalyticsSurfaceFromHeaders();
    if (surface !== "onboarding" && surface !== "getting_started") return;
    const connections = await loadSerpProviderChain(input.projectId);
    const provider =
      input.result.status === "completed" ? input.result.provider : connections[0]?.provider;
    if (!provider) return;
    await trackServerEvent("rank_check_preview_completed", {
      consent: await readConsentFromCookies(),
      distinctId: input.actorId,
      properties: {
        duration_ms: Math.max(0, Date.now() - input.startedAt),
        provider,
        status: input.result.status,
        surface,
      },
    });
  } catch {
    // Analytics must not change the preview result if request metadata or capture is unavailable.
  }
}
