import type { Prisma } from "@/lib/generated/prisma/client";
import {
  consumeManualConsent,
  type VerifiedManualConsent,
} from "@/lib/measurement-settings/host/reviewed-consent";
import type { RankRunHostBoundary } from "./launch-host";
import type { quoteRunRows } from "./native-quotes";
import type { resolveRunSelection } from "./selection";
import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import { readHostPolicySnapshot } from "@/lib/measurement-definitions/host-policy-snapshot";
import { captureDefinitionItemIntents } from "@/lib/measurement-definitions/worker-intent";
import { retainRunRecoveryGrant } from "@/lib/rank-check/recovery-run-grant";
import { resolveSerpStopOnMatch } from "@/lib/serp/constants";
import {
  estimatedRunUsageQuantity,
  providerAllocationReservation,
  quoteRankRunReservationForLaunch,
  runUsageEstimate,
} from "./launch-preflight";
import type { LaunchRankCheckRunInput, RetryLaunch } from "./launch-types";
import { prepareRankPayment } from "./payment";
import { previewSourceHash } from "./preview-source-hash";

export async function materializeRankRun(
  tx: Prisma.TransactionClient,
  {
    input,
    currentConnection,
    estimate,
    executable,
    resolved,
    now,
    publicId,
    orchestrationWorkflowId,
    host,
    consent,
    idempotencyKey,
  }: {
    input: LaunchRankCheckRunInput & { retry?: RetryLaunch };
    currentConnection: Parameters<typeof runUsageEstimate>[0];
    estimate: Awaited<ReturnType<typeof quoteRunRows>>;
    executable: Parameters<typeof quoteRunRows>[0];
    resolved: Awaited<ReturnType<typeof resolveRunSelection>>;
    now: Date;
    publicId: string;
    orchestrationWorkflowId: string;
    host: RankRunHostBoundary;
    consent?: VerifiedManualConsent;
    idempotencyKey: string | undefined;
  },
) {
  const rankReservation = await quoteRankRunReservationForLaunch(tx, {
    connection: currentConnection,
    projectId: input.project.id,
    source: input.origin.source,
    targets: estimate.targets,
  });
  const payment =
    input.acceptedPayment || input.requirePayment
      ? await prepareRankPayment(
          {
            ...input,
            projectId: input.project.id,
            source: input.origin.source,
            sourceHash: previewSourceHash({
              domain: input.project.domain,
              stopOnMatch: resolveSerpStopOnMatch(
                (
                  await tx.project.findUnique({
                    where: { id: input.project.id },
                    select: { defaults: { select: { serpStopOnMatch: true } } },
                  })
                )?.defaults?.serpStopOnMatch,
              ),
              rows: executable,
              depths: estimate.targets.map((target) => target.depth),
              provider: currentConnection,
              measurementPolicy: await readHostPolicySnapshot(tx, input.project.id),
            }),
            selectionHash: resolved.selectionHash,
            connection: currentConnection,
            targets: estimate.targets,
          },
          tx,
        )
      : null;
  const paymentConsent = payment?.retain(publicId);
  const estimatedCostCents = estimate.costCents ?? 0;
  const allocationReservation = currentConnection.id
    ? providerAllocationReservation(currentConnection.id, estimatedRunUsageQuantity(estimate))
    : currentConnection.id
      ? { providerConnectionId: currentConnection.id }
      : {};
  const usageEstimate = runUsageEstimate(currentConnection, estimate);
  const keywordCount = new Set(executable.map(({ text }) => text)).size;
  const definitionIntents = await captureDefinitionItemIntents(
    tx,
    input.project.id,
    estimate.targets,
  );
  const run = await tx.rankCheckRun.create({
    data: {
      credentialId: input.origin.credential?.id ?? null,
      credentialKind: input.origin.credential?.kind ?? null,
      estimatedCostCents,
      idempotencyKey,
      keywordCount,
      launchedAt: now,
      orchestrationWorkflowId,
      parentRelation: input.retry?.relation,
      parentRunId: input.retry?.parentRunId,
      projectId: input.project.id,
      publicId,
      requestedById: input.actorId,
      requestedCount: resolved.keywordIds.length,
      selectionHash: resolved.selectionHash,
      selectionKind: input.retry?.relation ?? input.spec.kind,
      selectionSpec: input.retry
        ? {
            kind: input.retry.relation,
            parentRunId: input.retry.parentRunPublicId,
            v: 1,
            ...(paymentConsent
              ? { rankPaymentConsent: paymentConsent, rankPaymentQuoteId: payment?.quote.id }
              : {}),
            ...usageEstimate,
            ...allocationReservation,
            ...rankReservation,
          }
        : {
            ...input.spec,
            ...(host.attribution ? { measurementSettingsIntent: host.attribution } : {}),
            depth: input.depth ?? null,
            providerId: input.providerId ?? null,
            ...(paymentConsent
              ? { rankPaymentConsent: paymentConsent, rankPaymentQuoteId: payment?.quote.id }
              : {}),
            ...usageEstimate,
            ...allocationReservation,
            ...rankReservation,
          },
      skippedCount: 0,
      source: input.origin.source,
      status: "queued",
      targetCount: executable.length,
      totalCount: executable.length,
      trigger: input.trigger,
    },
    select: { id: true },
  });
  await retainRunRecoveryGrant(tx, {
    runId: run.id,
    projectId: input.project.id,
    actorId: input.actorId,
    source: input.origin.source,
    trigger: input.trigger,
    credentialId: input.origin.credential?.id,
    now,
    targets: estimate.targets,
    connectionId: currentConnection.id,
  });
  await tx.rankCheckRunItem.createMany({
    data: estimate.targets.map((target) => ({
      definitionIntent: definitionIntents.get(target.keywordId),
      estimatedCostCents: target.cost,
      keywordId: target.keywordId,
      notBefore: null,
      runId: run.id,
      sourceRunItemId: input.retry?.sources.get(target.keywordId),
      status: "queued",
    })),
  });
  await writeAudit(
    {
      action: input.retry ? "rank_check_run.retry" : "rank_check_run.launch",
      actorId: input.actorId,
      after: input.retry
        ? { parentRunId: input.retry.parentRunPublicId, relation: input.retry.relation }
        : {
            estimatedCostCents,
            keywordCount,
            publicId,
            selectionKind: input.spec.kind,
            targetCount: executable.length,
            trigger: input.trigger,
            ...(consent
              ? { consent: consumeManualConsent(consent, input.project.id, input.actorId) }
              : {}),
          },
      projectId: input.project.id,
      targetId: publicId,
      targetType: "rank_check_run",
    },
    tx,
  );
  return {
    estimatedCostCents,
    id: run.id,
    keywordCount,
    targetCount: executable.length,
    ...(payment
      ? {
          payment: {
            actionId: publicId,
            quoteId: payment.quote.id,
            option: payment.quote.option,
            state: "pending" as const,
            charge: {
              unit: payment.quote.option.payableUnit,
              value: null,
              certainty: "unknown" as const,
            },
          },
        }
      : {}),
  };
}
