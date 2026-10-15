import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { createProviderRequestJournal } from "@/lib/provider-usage/request-journal";
import { createProviderRequestAttribution } from "@/lib/provider-usage/tag";
import { providerErrorCodeFromError } from "@/lib/providers/call-error";
import { resolveProviderCredentials } from "@/lib/providers/credentials";
import { startDeploymentExecution } from "@/lib/providers/execution-extension";
import { exactExecutionEstimate } from "@/lib/providers/execution-extension-estimate";
import type { DeploymentExecution } from "@/lib/providers/execution-extension-types";
import { consumeProviderLimit } from "@/lib/providers/rate-limit";
import { getSerpProvider } from "@/lib/providers/registry";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { assertComparisonAccess } from "./access";
import { comparisonAccounting } from "./accounting";
import { comparisonFences } from "./fence";
import { comparisonHash, parseComparisonSnapshot } from "./model";
import { quoteComparison } from "./quote";
import { comparisonRankInput } from "./request";
import { comparisonResult } from "./result";
import type { ComparisonProvider } from "./types";

async function claimSide(projectId: string, runId: string, provider: ComparisonProvider) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.providerComparisonRun.findFirst({
      where: { id: runId, projectId },
      include: { sides: true },
    });
    if (!run) return null;
    const side = run.sides.find((row) => row.provider === provider);
    if (!side) return null;
    if (side.status === "claimed") {
      // A retried activity has no right to repeat an interrupted provider call.
      await tx.providerComparisonSide.updateMany({
        where: { id: side.id, status: "claimed" },
        data: { status: "unknown", reason: "execution_interrupted", finishedAt: new Date() },
      });
      return null;
    }
    if (side.status !== "queued") return null;
    if (run.cancellationRequested) {
      await tx.providerComparisonSide.updateMany({
        where: { id: side.id, status: "queued" },
        data: { status: "cancelled", finishedAt: new Date() },
      });
      return null;
    }
    await assertComparisonAccess(tx, projectId, run.actorId, true);
    const token = randomUUID();
    const updated = await tx.providerComparisonSide.updateMany({
      where: { id: side.id, status: "queued" },
      data: { status: "claimed", claimToken: token, claimedAt: new Date() },
    });
    return updated.count
      ? { run, side, token, snapshot: parseComparisonSnapshot(run.snapshot) }
      : null;
  });
}
export async function executeComparisonSide(input: {
  projectId: string;
  runId: string;
  provider: ComparisonProvider;
}) {
  const claimed = await claimSide(input.projectId, input.runId, input.provider).catch(async () => {
    await prisma.providerComparisonSide.updateMany({
      where: {
        projectId: input.projectId,
        runId: input.runId,
        provider: input.provider,
        status: "queued",
      },
      data: { status: "failed", reason: "access_or_scope_unavailable", finishedAt: new Date() },
    });
    return null;
  });
  if (!claimed) return;
  const { side, run, snapshot, token } = claimed;
  const connection = snapshot.connections[input.provider === "dataforseo" ? 0 : 1];
  let execution: DeploymentExecution | null = null;
  let journal: ReturnType<typeof createProviderRequestJournal> | null = null;
  try {
    // Reprice the exact original two-sided scope before either native operation.
    const current = await quoteComparison(input.projectId, snapshot.keywordId, new Date());
    if (comparisonHash(current) !== run.sourceHash) throw new Error("Comparison quote changed.");
    const attribution = await createProviderRequestAttribution(
      {
        projectId: input.projectId,
        feature: "rank_check",
        source: "app",
        trigger: "manual",
        correlationId: `comparison:${side.id}`,
      },
      undefined,
      connection.fundingSource,
    );
    const fences = comparisonFences({
      ...input,
      sideId: side.id,
      token,
      actorId: run.actorId,
      snapshot,
      connection,
      tag: attribution.tag,
    });
    const estimatedQuantity = connection.provider === "serpapi" ? "2" : "1";
    if (connection.fundingSource === "hosted") {
      execution = await startDeploymentExecution({
        attribution,
        connectionId: connection.id,
        provider: connection.provider,
        operationKey: `provider-comparison:${side.id}`,
        estimatedCostCents: exactExecutionEstimate(connection.providerEstimateCents, 4),
        estimatedQuantity,
        maxCostCents: connection.customerEstimateCents,
        ...fences,
      });
      if (!execution) throw new ProviderUsagePersistenceError();
    } else {
      journal = createProviderRequestJournal(prisma, {
        attribution,
        connectionId: connection.id,
        projectId: input.projectId,
        provider: connection.provider,
        keywordId: snapshot.keywordId,
        unit: connection.provider === "serpapi" ? "units" : "cents",
        credentialVersion: connection.credentialVersion,
        maxCostCents: connection.customerEstimateCents,
        estimate: { cents: String(connection.providerEstimateCents), units: estimatedQuantity },
        ...fences,
      });
    }
    const live = await prisma.providerConnection.findFirst({
      where: { id: connection.id, projectId: input.projectId },
    });
    const credentials = execution?.credentials ?? {
      ...resolveProviderCredentials(connection.provider, live?.credentialsEncrypted),
      usageObserver: journal?.observer,
    };
    if (!credentials.usageObserver) throw new ProviderUsagePersistenceError();
    const limit = await consumeProviderLimit(connection.provider, credentials, {
      projectId: input.projectId,
    });
    if (!limit.success) throw new Error("Comparison rate limited.");
    const provider = getSerpProvider(connection.provider);
    if (!provider) throw new Error("Comparison provider unavailable.");
    const response = await provider.fetchRank({
      ...comparisonRankInput(snapshot, attribution.tag),
      attribution,
      credentials,
    });
    const usage = execution ?? journal;
    if (!usage?.started) throw new ProviderUsagePersistenceError();
    const result = comparisonResult(response, snapshot, new Date());
    await execution?.finish();
    execution = null;
    const accounting = await comparisonAccounting({
      projectId: input.projectId,
      sideId: side.id,
      connectionId: connection.id,
      fundingSource: connection.fundingSource,
    });
    if (accounting.uncertain) throw new ProviderUsagePersistenceError();
    await prisma.providerComparisonSide.updateMany({
      where: { id: side.id, claimToken: token, status: { in: ["claimed", "unknown"] } },
      data: {
        status: "completed",
        costCents: accounting.costCents,
        customerCostCents: accounting.customerCostCents,
        quantity: accounting.quantity,
        result: result as unknown as Prisma.InputJsonValue,
        reason: null,
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    let finishFailed = false;
    try {
      await execution?.finish();
    } catch {
      finishFailed = true;
    }
    const accounting = await comparisonAccounting({
      projectId: input.projectId,
      sideId: side.id,
      connectionId: connection.id,
      fundingSource: connection.fundingSource,
    }).catch(() => ({ uncertain: true, costCents: null, quantity: null, customerCostCents: null }));
    const uncertain = finishFailed || accounting.uncertain;
    await prisma.providerComparisonSide.updateMany({
      where: { id: side.id, claimToken: token, status: { in: ["claimed", "unknown"] } },
      data: {
        status: uncertain ? "unknown" : "failed",
        reason:
          error instanceof ProviderUsagePersistenceError
            ? "usage_unconfirmed"
            : providerErrorCodeFromError(error),
        costCents: uncertain ? null : accounting.costCents,
        customerCostCents: uncertain ? null : accounting.customerCostCents,
        quantity: uncertain ? null : accounting.quantity,
        finishedAt: new Date(),
      },
    });
  }
}
