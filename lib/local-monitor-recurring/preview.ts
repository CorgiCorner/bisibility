import "server-only";
import { prisma } from "@/lib/db/prisma";
import { materializeMonitorTargets } from "@/lib/local-monitor-launch/targets";
import { assertFrozenQuoteSelection, assertLocalQuote } from "@/lib/local-monitoring/quote";
import { resolveManualLocalDriver } from "@/lib/local-monitoring-host/manual-driver";
import { localProjectScope } from "@/lib/local-monitoring-store/access";
import type { LocalDatabase, LocalStoreContext } from "@/lib/local-monitoring-store/context";
import { recurringMonitorsEnabled } from "./config";
import { signRecurringConsent } from "./consent";
import { exactCents, recurringQuoteCents } from "./cost";
import { approvalSnapshotSchema, recurringPreviewSchema } from "./schema";
import { recurringCurrentSnapshot } from "./snapshot";
/** Explicit DB-only review. No Meter reserve, provider request, scheduler creation or dispatch. */
export async function previewRecurringMonitor(
  input: unknown,
  context: LocalStoreContext,
  db: LocalDatabase = prisma,
) {
  if (!recurringMonitorsEnabled()) throw new Error("Recurring monitor execution is disabled.");
  const command = recurringPreviewSchema.parse(input);
  return db.$transaction(async (tx) => {
    const scope = await localProjectScope(tx, context, command.projectId, "create");
    const snapshot = await recurringCurrentSnapshot(tx, scope, command);
    const result = await resolveManualLocalDriver(tx, {
      scope,
      definition: snapshot.definition,
      connectionPublicId: command.connectionId,
      source: "worker",
      trigger: "scheduled",
    });
    if (result.kind !== "ready") return result;
    const driver = result.driver,
      now = driver.ports.clock();
    await driver.ports.activation.assertRegistered(tx, driver.ports.adapter.capability);
    const targets = await materializeMonitorTargets(
        tx,
        scope,
        snapshot.definition,
        driver.ports.policy,
      ),
      quote = await driver.quote(tx, { projectId: scope.project.id, targets, now });
    assertFrozenQuoteSelection(
      quote,
      targets.map((row) => row.target),
    );
    for (const row of targets)
      assertLocalQuote({
        quote,
        target: row.target,
        capability: driver.ports.adapter.capability,
        providerPriceVersion: driver.ports.adapter.providerPriceVersion,
        now,
      });
    if (exactCents(recurringQuoteCents(quote)) > exactCents(command.maximumPerOccurrenceCents))
      throw new Error("Quote exceeds approved per-occurrence ceiling.");
    const binding = approvalSnapshotSchema.parse({
      ...command,
      revisionId: snapshot.revision.id,
      scheduleIntentId: snapshot.intent.id,
      calendar: snapshot.calendar,
      targetIds: targets.map((row) => row.id).sort(),
      quote,
      actorId: scope.actor.id,
      internalProjectId: scope.project.id,
      connectionStamp: snapshot.connectionStamp,
      definitionHash: snapshot.definitionHash,
    });
    const consent = signRecurringConsent(binding, now);
    const { actorId, internalProjectId, connectionStamp, definitionHash, ...publicCommand } =
      binding;
    return {
      kind: "ready" as const,
      command: { ...publicCommand, consentToken: consent.token },
      expiresAt: consent.expiresAt,
      nativeEstimates: quote.nativeEstimates,
      expectedCount: targets.length,
    };
  });
}
