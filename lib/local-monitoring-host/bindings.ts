import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { LocalSubmitCollectAdapter } from "@/lib/local-monitoring/execution-types";
import { cancelLocalMeasurementRun } from "@/lib/local-monitoring-store/cancel-run";
import { collectLocalMeasurementItem } from "@/lib/local-monitoring-store/collect-item";
import type { LocalDatabase, LocalStoreContext } from "@/lib/local-monitoring-store/context";
import {
  claimLocalContinuation,
  type LocalContinuationLease,
} from "@/lib/local-monitoring-store/continuation-lease";
import type { LocalNormalizationPort } from "@/lib/local-monitoring-store/evidence-types";
import { readLocalHostItem, readLocalHostRun } from "./read";
import { reconcileLocalHostItem } from "./reconcile";

/** Server action/API/worker share these scoped continuations; there is no prepare/submit method. */
export function bindLocalHostContinuations(input: {
  context: LocalStoreContext;
  clock: () => Date;
  db?: LocalDatabase;
}) {
  const db = input.db ?? prisma;
  return {
    readRun: (command: unknown) => readLocalHostRun(command, input.context, db),
    readItem: (command: unknown) => readLocalHostItem(command, input.context, db),
    claim: (command: unknown, options: { ttlMs: number }) =>
      claimLocalContinuation(command, input.context, { ...options, clock: input.clock }, db),
    reconcile: (command: unknown, lease: LocalContinuationLease) =>
      reconcileLocalHostItem(command, input.context, lease, input.clock, db),
    collect: (
      command: unknown,
      lease: LocalContinuationLease,
      adapter: Pick<LocalSubmitCollectAdapter, "collect" | "capability">,
      normalizer: LocalNormalizationPort,
    ) =>
      collectLocalMeasurementItem(
        command,
        input.context,
        lease,
        adapter,
        normalizer,
        input.clock,
        db,
      ),
    cancel: (command: unknown) => cancelLocalMeasurementRun(command, input.context, db),
  };
}
