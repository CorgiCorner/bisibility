import "server-only";
import { prisma } from "@/lib/db/prisma";
import { captureMonitorRetry } from "@/lib/local-monitor-retry/selection";
import { compareCodeUnits } from "@/lib/local-monitoring/key";
import { assertFrozenQuoteSelection, assertLocalQuote } from "@/lib/local-monitoring/quote";
import { executionTargetKey } from "@/lib/local-monitoring/target-key";
import { localProjectScope } from "@/lib/local-monitoring-store/access";
import type { LocalDatabase, LocalStoreContext } from "@/lib/local-monitoring-store/context";
import { signMonitorConsent } from "./consent";
import { monitorLaunchSchema, monitorPreviewSchema } from "./contracts";
import type { ManualLocalDriverFactory } from "./driver";
import { currentMonitorLaunchSnapshot } from "./snapshot";
import { materializeMonitorTargets } from "./targets";
/** Explicit non-paid preview may persist canonical target identities; it never submits or schedules. */
export async function previewMonitorLaunch(
  input: unknown,
  context: LocalStoreContext,
  factory: ManualLocalDriverFactory,
  db: LocalDatabase = prisma,
) {
  const command = monitorPreviewSchema.parse(input);
  return db.$transaction(async (tx) => {
    const scope = await localProjectScope(tx, context, command.projectId, "create");
    const snapshot = await currentMonitorLaunchSnapshot(tx, scope, command);
    const retrySelection = command.retry
      ? await captureMonitorRetry(tx, {
          projectId: scope.project.id,
          monitorId: command.monitorId,
          retry: command.retry,
          revisionId: snapshot.revision.id,
          scheduleIntentId: snapshot.intent.id,
          now: new Date(),
        })
      : null;
    const resolved = await factory(tx, {
      scope,
      definition: snapshot.definition,
      connectionPublicId: command.connectionId,
      ...(retrySelection
        ? {
            retryTargetKeys: retrySelection.targets.map(({ target }) => executionTargetKey(target)),
          }
        : {}),
    });
    if (resolved.kind === "unavailable") return resolved;
    const { driver } = resolved;
    await driver.ports.activation.assertRegistered(tx, driver.ports.adapter.capability);
    const targets =
      retrySelection?.targets ??
      (await materializeMonitorTargets(tx, scope, snapshot.definition, driver.ports.policy));
    const now = driver.ports.clock();
    const quote = await driver.quote(tx, {
      projectId: scope.project.id,
      targets,
      now,
    });
    assertFrozenQuoteSelection(
      quote,
      targets.map(({ target }) => target),
    );
    if (quote.nativeEstimates.some(({ amount }) => amount === null))
      return {
        kind: "unavailable" as const,
        reason: "pricing_unavailable" as const,
      };
    for (const { target } of targets)
      assertLocalQuote({
        quote,
        target,
        capability: driver.ports.adapter.capability,
        providerPriceVersion: driver.ports.adapter.providerPriceVersion,
        now,
      });
    const targetIds = targets.map(({ id }) => id).sort(compareCodeUnits);
    const consent = signMonitorConsent(
      {
        actorId: scope.actor.id,
        projectId: scope.project.id,
        monitorId: command.monitorId,
        monitorVersion: snapshot.monitor.version,
        revisionId: snapshot.revision.id,
        scheduleIntentId: snapshot.intent.id,
        connectionId: command.connectionId,
        connectionStamp: snapshot.connectionStamp,
        targetIds,
        idempotencyKey: command.idempotencyKey,
        quote,
        ...(retrySelection ? { retry: retrySelection.approval } : {}),
      },
      now,
    );
    return {
      kind: "ready" as const,
      command: monitorLaunchSchema.parse({
        ...command,
        ...(retrySelection ? { retry: retrySelection.approval } : {}),
        revisionId: snapshot.revision.id,
        scheduleIntentId: snapshot.intent.id,
        targetIds,
        quote,
        consentToken: consent.token,
      }),
      expiresAt: consent.expiresAt,
      expectedCount: targetIds.length,
      nativeEstimates: quote.nativeEstimates,
    };
  });
}
