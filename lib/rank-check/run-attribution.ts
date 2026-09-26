import "server-only";

import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  PROVIDER_CREDENTIAL_KINDS,
  type ProviderCredential,
  SOURCES_BY_SURFACE,
} from "@/lib/provider-usage/surface";
import type { ProviderRequestSource, ProviderRequestTrigger } from "@/lib/provider-usage/tag";
import type { RankCheckExecutionSource } from "@/lib/temporal/rank-check-activity-contract";

export type RankCheckAttribution = Readonly<{
  credential?: ProviderCredential;
  source: ProviderRequestSource;
  trigger: ProviderRequestTrigger;
}>;

type AttributionRun = {
  credentialId: string | null;
  credentialKind: string | null;
  source: string | null;
  trigger: string;
};

/**
 * The stored run source the recorder may still be asked to attribute. The legacy source of
 * historical rows is deliberately absent from the allowlist, so it maps to the app surface here
 * instead of travelling downstream; anything else unknown falls back to `app` too.
 */
function attributableSource(value: string | null): ProviderRequestSource {
  if (
    value !== null &&
    (SOURCES_BY_SURFACE.programmatic.includes(value as ProviderRequestSource) || value === "app")
  ) {
    return value as ProviderRequestSource;
  }
  return "app";
}

function runCredential(run: AttributionRun): ProviderCredential | undefined {
  if (run.credentialKind === null || run.credentialId === null) return undefined;
  if (!PROVIDER_CREDENTIAL_KINDS.includes(run.credentialKind as never)) return undefined;
  return { id: run.credentialId, kind: run.credentialKind as ProviderCredential["kind"] };
}

/**
 * The provider attribution of a rank check the worker is about to execute. A run item carries its
 * run's stored origin, so an API-launched check keeps its programmatic surface however much later
 * the activity fires; anything without a readable run is attributed to the app surface, split only
 * by whether the execution source names a deliberate operator action.
 */
export async function resolveRankCheckAttribution(
  input: { runItemId?: string; source: RankCheckExecutionSource },
  db: Pick<PrismaClient, "rankCheckRunItem">,
): Promise<RankCheckAttribution> {
  if (input.runItemId) {
    const item = await db.rankCheckRunItem.findUnique({
      select: {
        run: { select: { credentialId: true, credentialKind: true, source: true, trigger: true } },
      },
      where: { id: input.runItemId },
    });
    const run = item?.run;
    if (run) {
      const credential = runCredential(run);
      return {
        ...(credential ? { credential } : {}),
        source: attributableSource(run.source),
        trigger: run.trigger === "scheduled" ? "scheduled" : "manual",
      };
    }
  }
  if (input.source === "manual") return { source: "app", trigger: "manual" };
  return { source: "app", trigger: "scheduled" };
}
