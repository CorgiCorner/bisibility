import { queuedRankCheckConfig } from "@/lib/rank-check/queued-config";
/** Same maintained normal-queue polling/age policy. This never extends a paid quote. */
export function monitorWorkerPolicy(now: Date, env: NodeJS.ProcessEnv = process.env) {
  const config = queuedRankCheckConfig({ ...env, DATAFORSEO_QUEUE_PRIORITY: "normal" });
  if (config.invalidKeys.length) throw new Error("Invalid configured normal queue policy.");
  return {
    pollIntervalMs: config.pollIntervalSeconds * 1000,
    collectionDeadline: new Date(now.getTime() + config.maxQueueAgeSeconds * 1000),
  };
}
