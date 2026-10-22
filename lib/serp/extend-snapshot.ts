import "server-only";

import { paymentFailure } from "@/lib/action-payment/session";
import { prisma } from "@/lib/db/prisma";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import { snapshotDefinitionSession } from "@/lib/measurement-definitions/snapshot-dispatch";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { createProviderRequestAttribution } from "@/lib/provider-usage/tag";
import { serpApiProvider } from "@/lib/providers/serp/serpapi";
import { fetchSerpApiSnapshotPage } from "@/lib/providers/serp/serpapi-snapshot";
import type { SerpOrganicResult } from "@/lib/providers/types";
import { runCheckWithFallback } from "@/lib/rank-check/fallback";
import { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import { fallbackSchedule } from "@/lib/rank-check/runner";
import { mergeSnapshotPage } from "./snapshot-extension";
import { readSnapshotContinuation, readSnapshotPageEvidence } from "./snapshot-extension-state";
import { claimSnapshotExtension, finishSnapshotExtension } from "./snapshot-extension-store";
import {
  assertSnapshotPaymentScope,
  prepareSnapshotExtensionPayment,
  type SnapshotPaymentInput,
} from "./snapshot-payment";

export async function extendSnapshot(input: SnapshotPaymentInput) {
  const prepared = await (async () => {
    const result = await prepareSnapshotExtensionPayment(input, true);
    if (!result.ok) return result;
    return { ...result, paidCall: result.payment.child("snapshot-page") };
  })().catch((error: unknown) => {
    const failure = paymentFailure(error);
    if (failure) return failure;
    throw error;
  });
  if (!prepared.ok) return prepared;
  const quote = prepared.payment.quote;
  const claim = await claimSnapshotExtension({
    ...input,
    payment: {
      actionId: quote.id,
      quoteId: quote.id,
      option: quote.option,
      state: "pending",
      charge: { value: null, unit: quote.option.payableUnit, certainty: "unknown" },
    },
  });
  if (!claim.ok) return claim;
  try {
    assertSnapshotPaymentScope(prepared.scopeHash, {
      checkId: input.checkId,
      context: claim.context,
      nextStart: claim.state.nextStart,
    });
    const connections = (await loadSerpProviderChain(input.projectId, "serpapi")).filter(
      (connection) =>
        connection.id === claim.context.connectionId &&
        connection.credentialSource === (claim.definition.credentialSource ?? "own"),
    );
    if (connections.length !== 1 || !connections[0].id)
      throw new Error("Original snapshot connection is unavailable.");
    const credentialVersion =
      connections[0].credentialSource === "own"
        ? ownCredentialVersion("serpapi", connections[0].id, connections[0].credentialsEncrypted)
        : null;
    if (connections[0].credentialSource === "own" && !credentialVersion)
      throw new Error("Original snapshot credential version is unavailable.");
    const definitionContinuation = snapshotDefinitionSession(claim.definition, credentialVersion);
    const attribution = await createProviderRequestAttribution({
      correlationId: claim.check.id,
      feature: "rank_check",
      projectId: input.projectId,
      source: "app",
      trigger: "manual",
    });
    const outcome = await runCheckWithFallback({
      payment: prepared.paidCall,
      projectId: input.projectId,
      rankCheckId: claim.check.id,
      definitionContinuation,
      providerUsage: attribution,
      connections,
      depth: 10,
      stopOnMatch: false,
      keyword: {
        id: claim.check.keywordId,
        text: claim.context.keyword,
        domain: claim.context.domain,
        location: claim.context.location,
        device: claim.context.device,
      },
      schedule: fallbackSchedule(),
      source: "app",
      resolveProvider: () => ({
        ...serpApiProvider,
        fetchRank: async (rankInput) => {
          if (!claim.state.leaseUntil || Date.now() + 65_000 >= Date.parse(claim.state.leaseUntil))
            throw new Error("Snapshot extension lease expired before dispatch.");
          const project = await prisma.project.findUnique({
            where: { id: input.projectId },
            select: { id: true, writeMode: true },
          });
          if (!project) throw new Error("Project not found.");
          assertProjectWritable(project);
          return fetchSerpApiSnapshotPage(rankInput, claim.context, claim.state.nextStart);
        },
      }),
    });
    const raw = outcome.result.rankCheck.raw;
    const next = readSnapshotContinuation(raw);
    if (!next || !raw || !outcome.result.usageRecorded)
      throw new Error("Snapshot extension could not be confirmed.");
    const original = claim.raw.organic_results as unknown as SerpOrganicResult[];
    const merged = mergeSnapshotPage(
      [...original, ...claim.state.pages.flatMap((page) => page.rows)],
      raw.organic_results as unknown as SerpOrganicResult[],
    );
    const payment = prepared.payment.receipt();
    await finishSnapshotExtension({
      ...input,
      claim,
      state: {
        ...claim.state,
        payment,
        state: "idle",
        nextStart: next.nextStart,
        ended: next.ended,
        pages: [
          ...claim.state.pages,
          {
            payment,
            start: claim.state.nextStart,
            fetchedAt: outcome.result.rankCheck.checkedAt.toISOString(),
            ...merged,
            evidence: readSnapshotPageEvidence(raw),
          },
        ],
      },
    });
    return { ok: true as const, payment };
  } catch (error) {
    const payment = prepared.payment.receipt();
    const saved = await finishSnapshotExtension({
      ...input,
      claim,
      state: { ...claim.state, state: "failed", payment },
    }).catch(() => undefined);
    return {
      ok: false as const,
      reason:
        paymentFailure(error)?.reason ??
        (saved?.state === "retryable" ? ("not_sent" as const) : ("failed" as const)),
      payment,
    };
  }
}
