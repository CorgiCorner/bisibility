import "server-only";

import { randomUUID } from "node:crypto";
import { compareAdmission } from "@/lib/metering/admission";
import { type ProviderCredential, surfaceOf } from "@/lib/provider-usage/surface";
import {
  createProviderRequestAttribution,
  type ProviderRequestAttribution,
  type ProviderRequestSource,
  type ProviderRequestTrigger,
} from "@/lib/provider-usage/tag";
import type { resolveProviderCredentials } from "@/lib/providers/credentials";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import type { SerpProvider } from "@/lib/providers/types";
import { runDeploymentPaidCall } from "./paid-call-deployment";

/** Hosted-credential paid lookups: deployment execution plus an observation-only shadow. */
export async function runHostedPaidProviderCall<
  T extends { costCents: number; providerRequestId?: string; usageQuantity?: number },
>(input: {
  call: (
    credentials: ReturnType<typeof resolveProviderCredentials>,
    usage: ProviderRequestAttribution,
  ) => Promise<T>;
  connection: { credentialsEncrypted: string | null; id: string; provider: string };
  credential?: ProviderCredential;
  feature:
    | "backlinks"
    | "domain_overview"
    | "keyword_metrics"
    | "keyword_research"
    | "ranked_keywords";
  itemCount: number;
  projectId: string;
  provider: SerpProvider;
  source: ProviderRequestSource;
  trigger: ProviderRequestTrigger;
  estimatedCostCents: number;
}): Promise<T> {
  const usage = await createProviderRequestAttribution(
    {
      correlationId: randomUUID(),
      feature: input.feature,
      projectId: input.projectId,
      source: input.source,
      trigger: input.trigger,
    },
    input.credential,
    "hosted",
  );
  try {
    return await runDeploymentPaidCall({
      attribution: usage,
      call: input.call,
      connectionId: input.connection.id,
      credential: input.credential,
      estimatedCostCents: input.estimatedCostCents,
      estimatedQuantity: input.itemCount,
      provider: input.provider.id,
    });
  } catch (error) {
    if (error instanceof DeploymentAdmissionExhaustedError) {
      // Credit denials mirror the own path's wallet comparison; allocation denials its budget one.
      await compareAdmission(
        {
          connectionId: input.connection.id,
          projectId: input.projectId,
          provider: input.provider.id,
          surface: surfaceOf(input.source),
          estimatedCostCents: input.estimatedCostCents,
          credentialSource: "hosted",
          shadow: { feature: input.feature, source: input.source, credential: input.credential },
        },
        error.reason === "balance" ? "wallet_blocked" : "blocked",
      );
    }
    throw error;
  }
}
