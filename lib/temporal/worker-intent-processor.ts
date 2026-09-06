import "server-only";

import { reconcileRequestedSearchInsightsSyncs } from "../search-insights/sync/requested-sync-reconciler";
import { hasPendingWorkerIntent } from "../worker-intents/pending-probe";
import { subscribeToWorkerIntents, workerIntentPollIntervalMs } from "../worker-intents/realtime";
import { dispatchQueuedRankCheckRunIntents } from "./rank-run-intent-dispatch";
import { dispatchFirstTrafficSyncIntent } from "./traffic-intent-dispatch";
import { sweepWelcomeFollowupIntents } from "./welcome-intent-processor";

type SweepOptions = {
  dispatchRankRuns?: typeof dispatchQueuedRankCheckRunIntents;
  dispatchTraffic?: typeof dispatchFirstTrafficSyncIntent;
  reconcileSearchInsights?: typeof reconcileRequestedSearchInsightsSyncs;
  sweepWelcome?: typeof sweepWelcomeFollowupIntents;
};

export async function sweepWorkerIntents(options: SweepOptions = {}) {
  // A person is usually waiting on a rank run, so it goes before the background syncs.
  const rankRuns = await (options.dispatchRankRuns ?? dispatchQueuedRankCheckRunIntents)();
  const search = await (options.reconcileSearchInsights ?? reconcileRequestedSearchInsightsSyncs)();
  const traffic = await (options.dispatchTraffic ?? dispatchFirstTrafficSyncIntent)();
  const welcome = await (options.sweepWelcome ?? sweepWelcomeFollowupIntents)();
  return { rankRuns, search, traffic, welcome };
}

export function startWorkerIntentProcessor() {
  let active: Promise<unknown> | null = null;
  let closed = false;
  const runSweep = () => {
    if (closed || active) return;
    active = sweepWorkerIntents()
      .catch(() => console.error("[worker-intents] sweep failed"))
      .finally(() => {
        active = null;
      });
  };
  const poll = async () => {
    if (closed || active) return;
    try {
      if (await hasPendingWorkerIntent()) runSweep();
    } catch {
      console.error("[worker-intents] pending probe failed");
    }
  };
  const subscription = subscribeToWorkerIntents(() => runSweep());
  const timer = setInterval(() => void poll(), workerIntentPollIntervalMs());
  timer.unref();
  void poll();

  return {
    async close() {
      closed = true;
      clearInterval(timer);
      subscription?.close();
      await active;
    },
  };
}
