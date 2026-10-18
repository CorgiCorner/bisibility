import "server-only";
import { sweepAchievementMail } from "../achievements/mail";
import { sweepAchievementFacts } from "../achievements/process";
import { produceDueRecurringMonitors } from "../local-monitor-recurring/producer";
import { reconcileRequestedSearchInsightsSyncs } from "../search-insights/sync/requested-sync-reconciler";
import { hasPendingWorkerIntent } from "../worker-intents/pending-probe";
import { subscribeToWorkerIntents, workerIntentPollIntervalMs } from "../worker-intents/realtime";
import { dispatchAiTrackingIntents } from "./ai-tracking-intent-dispatch";
import { dispatchLocalMonitorIntents } from "./local-monitor-intent-dispatch";
import { dispatchProviderComparisonIntents } from "./provider-comparison-intents";
import { dispatchQueuedRankCheckRunIntents } from "./rank-run-intent-dispatch";
import { dispatchFirstTrafficSyncIntent } from "./traffic-intent-dispatch";
import { sweepWelcomeFollowupIntents } from "./welcome-intent-processor";

type SweepOptions = {
  produceLocalMonitors?: typeof produceDueRecurringMonitors;
  dispatchLocalMonitors?: typeof dispatchLocalMonitorIntents;
  dispatchComparisons?: typeof dispatchProviderComparisonIntents;
  dispatchTracking?: typeof dispatchAiTrackingIntents;
  dispatchRankRuns?: typeof dispatchQueuedRankCheckRunIntents;
  dispatchTraffic?: typeof dispatchFirstTrafficSyncIntent;
  reconcileSearchInsights?: typeof reconcileRequestedSearchInsightsSyncs;
  sweepWelcome?: typeof sweepWelcomeFollowupIntents;
  sweepAchievements?: typeof sweepAchievementFacts;
  sweepAchievementMail?: typeof sweepAchievementMail;
};

export async function sweepWorkerIntents(options: SweepOptions = {}) {
  // A person is usually waiting on a rank run, so it goes before the background syncs.
  const rankRuns = await (options.dispatchRankRuns ?? dispatchQueuedRankCheckRunIntents)();
  const localRecurring = await (options.produceLocalMonitors ?? produceDueRecurringMonitors)();
  const localMonitors = await (options.dispatchLocalMonitors ?? dispatchLocalMonitorIntents)();
  const comparisons = await (options.dispatchComparisons ?? dispatchProviderComparisonIntents)();
  const tracking = await (options.dispatchTracking ?? dispatchAiTrackingIntents)();
  const search = await (options.reconcileSearchInsights ?? reconcileRequestedSearchInsightsSyncs)();
  const traffic = await (options.dispatchTraffic ?? dispatchFirstTrafficSyncIntent)();
  for (const sweep of [
    options.sweepAchievements ?? sweepAchievementFacts,
    options.sweepAchievementMail ?? sweepAchievementMail,
  ]) {
    try {
      await sweep();
    } catch {
      console.error("[achievements] intent sweep failed");
    }
  }
  const welcome = await (options.sweepWelcome ?? sweepWelcomeFollowupIntents)();
  return {
    rankRuns,
    localRecurring,
    localMonitors,
    comparisons,
    tracking,
    search,
    traffic,
    welcome,
  };
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
