import { sweepHistoricalRecovery } from "@/lib/provider-evidence/recovery/historical";
import "server-only";
import { processRecoveryLookups } from "@/lib/provider-evidence/recovery/job";
import { sweepRecoveryCandidates } from "@/lib/provider-evidence/recovery/sweep";
import { maintainRetainedRankResults } from "@/lib/rank-check/recovery-maintenance";
import { isScheduledMaintenanceEnabled } from "@/lib/temporal/maintenance-schedule-bootstrap";
import { providerRecoveryWorkflowStop } from "@/lib/temporal/provider-recovery-probe";
import { processRecoveryCommands } from "./execute";

export function startRecoveryProcessor() {
  let closed = false,
    inFlight: Promise<void> | null = null,
    lastResults = 0;
  function tick() {
    if (closed || inFlight) return;
    inFlight = (async () => {
      await processRecoveryCommands();
      if (isScheduledMaintenanceEnabled() && Date.now() - lastResults >= 60000) {
        await sweepRecoveryCandidates(providerRecoveryWorkflowStop);
        await sweepHistoricalRecovery(providerRecoveryWorkflowStop);
        await processRecoveryLookups();
        await maintainRetainedRankResults();
        lastResults = Date.now();
      }
    })()
      .catch(() => console.error("[metering] recovery worker requires retry"))
      .finally(() => {
        inFlight = null;
      });
  }
  const timer = setInterval(tick, 10000);
  timer.unref();
  tick();
  return {
    async close() {
      closed = true;
      clearInterval(timer);
      await inFlight;
    },
  };
}
