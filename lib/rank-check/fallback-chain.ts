import { ActionPaymentError } from "@/lib/action-payment/token";
import type { SnapshotDefinitionSession } from "@/lib/measurement-definitions/snapshot-dispatch";
import { assertSnapshotContinuationPreflight } from "@/lib/measurement-definitions/snapshot-preflight";
import type { DefinitionExecutionPermit } from "@/lib/measurement-definitions/worker-claim";
import type { ProviderRequestAttribution, ProviderRequestSource } from "@/lib/provider-usage/tag";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import { getSerpProvider } from "@/lib/providers/registry";
import type { SerpProvider } from "@/lib/providers/types";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import type { SerpDepth } from "@/lib/serp/constants";
import { fallbackAttempt } from "./fallback-attempt";
import { locationForProvider } from "./fallback-location";
import { assertLegacyLiveBudget } from "./legacy-live-preflight";
import {
  type FallbackAttempt,
  loadFreshSerpProviderConnection,
  ProviderChainError,
} from "./provider-chain-loader";
import {
  PROVIDER_NOT_CONNECTED_MESSAGE,
  type RankCheckConnectionInput,
  type RankCheckKeywordInput,
  runCheck,
} from "./runner";
import { RankCheckRunnerError } from "./runner-error";
import { rankPaymentExecution } from "./runs/payment-runtime";
import type { RankCheckScheduleInput } from "./schedule";
export type RunCheckChainInput = {
  payment?: import("@/lib/action-payment/paid-call").PaidCallPayment;
  definitionContinuation?: SnapshotDefinitionSession;
  definitionPermit?: DefinitionExecutionPermit;
  comparisonAllowed?: boolean;
  keyword: RankCheckKeywordInput;
  schedule: RankCheckScheduleInput;
  depth?: SerpDepth;
  stopOnMatch?: boolean;
  connections: RankCheckConnectionInput[];
  previousPosition?: number | null;
  completedCheckCount?: number;
  now?: Date;
  projectId?: string;
  providerUsage?: ProviderRequestAttribution;
  rankCheckId?: string;
  locationGranular?: boolean;
  resolveProvider?: (id: string) => SerpProvider;
  source?: ProviderRequestSource;
};

export type RunCheckChainResult = {
  result: Awaited<ReturnType<typeof runCheck>>;
  provider: string;
  attempts: FallbackAttempt[];
};

export async function runCheckWithFallback(
  input: RunCheckChainInput,
): Promise<RunCheckChainResult> {
  if (input.connections.length === 0) {
    throw new RankCheckRunnerError("no_provider_connected", PROVIDER_NOT_CONNECTED_MESSAGE);
  }

  const retained =
    input.rankCheckId && !input.definitionContinuation && !input.payment
      ? await rankPaymentExecution(input.rankCheckId, input.connections, input.projectId)
      : { connections: input.connections, payment: input.payment };
  input = {
    ...input,
    connections: retained.payment ? retained.connections.slice(0, 1) : retained.connections,
    payment: retained.payment,
  };
  const resolveProvider = input.resolveProvider ?? getSerpProvider;
  const attempts: FallbackAttempt[] = [];
  let admissionExhaustion:
    | import("@/lib/providers/execution-extension-errors").DeploymentAdmissionExhaustedError
    | undefined;
  let rateLimitedOnly = true;

  for (const connection of input.connections) {
    const currentConnection =
      input.projectId && connection.id
        ? await loadFreshSerpProviderConnection(input.projectId, connection.id, connection.provider)
        : null;
    const liveConnection = input.projectId && connection.id ? currentConnection : connection;
    if (!liveConnection) {
      throw new ProviderUsagePersistenceError({ cause: new Error("Provider connection changed.") });
    }
    if (
      input.payment &&
      ((input.payment.connectionId && liveConnection.id !== input.payment.connectionId) ||
        liveConnection.credentialSource !== input.payment.snapshot.credentialSource ||
        (liveConnection.credentialSource === "own" &&
          liveConnection.credentialsEncrypted !== input.payment.snapshot.credentialsEncrypted))
    )
      throw new ActionPaymentError("payment_quote_changed");
    let provider: SerpProvider;

    try {
      provider = resolveProvider(connection.provider);
    } catch (error) {
      const fallback = fallbackAttempt(error, connection.provider, input.source);
      if (fallback) {
        attempts.push(fallback.attempt);
        admissionExhaustion = fallback.admission;
        if (!fallback.rateLimited) rateLimitedOnly = false;
        continue;
      }
      throw error;
    }

    try {
      if (input.definitionContinuation) {
        await assertSnapshotContinuationPreflight(input.definitionContinuation, {
          projectId: input.projectId,
          keywordId: input.keyword.id,
          rankCheckId: input.rankCheckId,
          connection: liveConnection,
        });
      } else if (input.projectId && liveConnection.credentialSource !== "hosted") {
        await assertLegacyLiveBudget({
          connection: liveConnection,
          depth: input.depth ?? 100,
          keywordId: input.keyword.id,
          now: input.now ?? new Date(),
          projectId: input.projectId,
          rankCheckId: input.rankCheckId,
          reservationConnection: input.connections[0],
          source: input.source ?? "app",
        });
      }
      const result = await runCheck({
        payment: input.payment,
        definitionPermit: input.definitionPermit,
        definitionContinuation: input.definitionContinuation,
        comparisonAllowed: input.comparisonAllowed,
        connection: liveConnection,
        depth: input.depth,
        stopOnMatch: input.stopOnMatch,
        keyword: {
          ...input.keyword,
          location: locationForProvider(
            provider.id,
            input.keyword.location,
            input.locationGranular ?? false,
          ),
        },
        now: input.now,
        previousPosition: input.previousPosition,
        completedCheckCount: input.completedCheckCount,
        projectId: input.projectId,
        providerUsage: input.providerUsage,
        rankCheckId: input.rankCheckId,
        provider,
        schedule: input.schedule,
      });

      return { attempts, provider: provider.id, result };
    } catch (error) {
      const fallback = fallbackAttempt(error, connection.provider, input.source);
      if (fallback) {
        attempts.push(fallback.attempt);
        admissionExhaustion = fallback.admission;
        if (!fallback.rateLimited) rateLimitedOnly = false;
        continue;
      }

      throw error;
    }
  }

  if (rateLimitedOnly) {
    const chainMsg = `All SERP providers rate limited: ${attempts.map((a) => `${a.provider} (${a.message})`).join("; ")}`;
    throw new ProviderRateLimitedError(input.connections[0].provider, { message: chainMsg });
  }

  throw new ProviderChainError(attempts, admissionExhaustion);
}
