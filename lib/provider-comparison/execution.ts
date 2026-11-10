import { connectionResponseRecorder } from "@/lib/provider-responses/connection";
import "server-only";
import { randomUUID } from "node:crypto";
import { withRequestUsage } from "@/lib/analytics/request-usage-context";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { assertComparisonAccess } from "@/lib/provider-comparison/access";
import { comparisonAccounting } from "@/lib/provider-comparison/accounting";
import { comparisonFences } from "@/lib/provider-comparison/fence";
import { comparisonHash, parseComparisonSnapshot } from "@/lib/provider-comparison/model";
import { quoteComparison } from "@/lib/provider-comparison/quote";
import { comparisonRankInput } from "@/lib/provider-comparison/request";
import { comparisonResult } from "@/lib/provider-comparison/result";
import type { ComparisonProvider } from "@/lib/provider-comparison/types";
import { createProviderRequestJournal } from "@/lib/provider-usage/request-journal";
import { createProviderRequestAttribution } from "@/lib/provider-usage/tag";
import { providerErrorCodeFromError } from "@/lib/providers/call-error";
import { resolveProviderCredentials } from "@/lib/providers/credentials";
import { startDeploymentExecution } from "@/lib/providers/execution-extension";
import { exactExecutionEstimate } from "@/lib/providers/execution-extension-estimate";
import type { DeploymentExecution } from "@/lib/providers/execution-extension-types";
import { assertOwnKeyStored } from "@/lib/providers/own-key-guard";
import { consumeProviderLimit } from "@/lib/providers/rate-limit";
import { getSerpProvider } from "@/lib/providers/registry";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { quotePlaygroundComparison } from "./playground-quote";
import { retainComparisonCapture } from "./retained-result";

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
async function executeComparisonSideImpl(input: {
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
  const connection = snapshot.connections.find((side) => side.provider === input.provider);
  if (!connection) return;
  await withRequestUsage(
    {
      projectId: input.projectId,
      actorId: run.actorId,
      source: "app",
      feature: "rank_check",
      operationKey: `comparison/${side.id}`,
      timestamp: run.createdAt,
    },
    async () => {
      let retainedResult: ReturnType<typeof comparisonResult> | null = null;
      let execution: DeploymentExecution | null = null;
      let journal: ReturnType<typeof createProviderRequestJournal> | null = null;
      let succeeded = false;
      try {
        // Reprice the exact original scope before either native operation.
        const current =
          snapshot.version === 2
            ? await quotePlaygroundComparison(
                input.projectId,
                {
                  depth: snapshot.depth,
                  ...(snapshot.aiOverview ? { aiOverview: true as const } : {}),
                  query: snapshot.text,
                  locationId: snapshot.locationId,
                  device: snapshot.device,
                  providers: snapshot.connections.map((side) => side.provider),
                },
                new Date(),
              )
            : await quoteComparison(input.projectId, snapshot.keywordId, new Date());
        if (comparisonHash(current) !== run.sourceHash)
          throw new Error("Comparison quote changed.");
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
        const estimatedQuantity =
          connection.provider === "serpapi"
            ? String(snapshot.aiOverview ? 2 : Math.ceil((snapshot.depth ?? 20) / 10))
            : "1";
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
            ...(snapshot.keywordId ? { keywordId: snapshot.keywordId } : {}),
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
        if (!execution && live?.credentialSource !== "own")
          throw new ProviderUsagePersistenceError();
        if (!execution)
          await assertOwnKeyStored({
            capability: "rank_check",
            credentialsEncrypted: live?.credentialsEncrypted,
            projectId: input.projectId,
            provider: connection.provider,
          });
        const credentials = execution?.credentials ?? {
          ...resolveProviderCredentials(connection.provider, live?.credentialsEncrypted),
          usageObserver: journal?.observer,
          captureResponse: connectionResponseRecorder(
            connection.id,
            connection.provider,
            "rank_check",
          ),
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
          captureProviderResponse: snapshot.version === 2,
          allowIncompleteResults: snapshot.version === 2,
          attribution,
          credentials,
        });
        const usage = execution ?? journal;
        if (!usage?.started) throw new ProviderUsagePersistenceError();
        retainedResult = retainComparisonCapture(
          comparisonResult(response, snapshot, new Date()),
          response,
        );
        // Retained observation and financial certainty are independent; never rebuy to recover either.
        await prisma.providerComparisonSide.updateMany({
          where: { id: side.id, claimToken: token, status: { in: ["claimed", "unknown"] } },
          data: { result: retainedResult as unknown as Prisma.InputJsonValue },
        });
        await execution?.finish();
        execution = null;
        const accounting = await comparisonAccounting({
          projectId: input.projectId,
          sideId: side.id,
          connectionId: connection.id,
          fundingSource: connection.fundingSource,
        });
        if (accounting.uncertain) throw new ProviderUsagePersistenceError();
        const completed = await prisma.providerComparisonSide.updateMany({
          where: { id: side.id, claimToken: token, status: { in: ["claimed", "unknown"] } },
          data: {
            status: "completed",
            costCents: accounting.costCents,
            customerCostCents: accounting.customerCostCents,
            quantity: accounting.quantity,
            result: retainedResult as unknown as Prisma.InputJsonValue,
            reason: null,
            finishedAt: new Date(),
          },
        });
        succeeded = completed.count === 1;
      } catch (caughtError) {
        const error = execution?.classifyFailure
          ? await execution.classifyFailure(caughtError)
          : caughtError;
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
        }).catch(() => ({
          uncertain: true,
          costCents: null,
          quantity: null,
          customerCostCents: null,
        }));
        const uncertain = finishFailed || accounting.uncertain;
        const completed = await prisma.providerComparisonSide.updateMany({
          where: { id: side.id, claimToken: token, status: { in: ["claimed", "unknown"] } },
          data: {
            status: uncertain ? "unknown" : retainedResult ? "completed" : "failed",
            ...(retainedResult
              ? { result: retainedResult as unknown as Prisma.InputJsonValue }
              : {}),
            reason:
              retainedResult && !uncertain
                ? null
                : error instanceof ProviderUsagePersistenceError
                  ? "usage_unconfirmed"
                  : providerErrorCodeFromError(error),
            costCents: uncertain ? null : accounting.costCents,
            customerCostCents: uncertain ? null : accounting.customerCostCents,
            quantity: uncertain ? null : accounting.quantity,
            finishedAt: new Date(),
          },
        });
        succeeded = completed.count === 1 && Boolean(retainedResult) && !uncertain;
      }
      return { ok: succeeded };
    },
  );
}

export const executeComparisonSide = executeComparisonSideImpl;
