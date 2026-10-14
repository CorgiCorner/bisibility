import "server-only";

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

export async function extendSnapshot(input: {
  actorId: string;
  projectId: string;
  checkId: string;
  nextStart: number;
}) {
  const claim = await claimSnapshotExtension(input);
  if (!claim.ok) return claim;
  try {
    const connections = (await loadSerpProviderChain(input.projectId, "serpapi")).filter(
      (connection) =>
        connection.id === claim.context.connectionId && connection.credentialSource === "own",
    );
    if (connections.length !== 1 || !connections[0].id || !connections[0].credentialsEncrypted)
      throw new Error("Original snapshot connection is unavailable.");
    const credentialVersion = ownCredentialVersion(
      "serpapi",
      connections[0].id,
      connections[0].credentialsEncrypted,
    );
    if (!credentialVersion) throw new Error("Original snapshot credential version is unavailable.");
    const definitionContinuation = snapshotDefinitionSession(claim.definition, credentialVersion);
    const attribution = await createProviderRequestAttribution({
      correlationId: claim.check.id,
      feature: "rank_check",
      projectId: input.projectId,
      source: "app",
      trigger: "manual",
    });
    const outcome = await runCheckWithFallback({
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
    await finishSnapshotExtension({
      ...input,
      claim,
      state: {
        ...claim.state,
        state: "idle",
        nextStart: next.nextStart,
        ended: next.ended,
        pages: [
          ...claim.state.pages,
          {
            start: claim.state.nextStart,
            fetchedAt: outcome.result.rankCheck.checkedAt.toISOString(),
            ...merged,
            evidence: readSnapshotPageEvidence(raw),
          },
        ],
      },
    });
    return { ok: true as const };
  } catch {
    await finishSnapshotExtension({
      ...input,
      claim,
      state: { ...claim.state, state: "failed" },
    }).catch(() => undefined);
    return { ok: false as const, reason: "failed" as const };
  }
}
