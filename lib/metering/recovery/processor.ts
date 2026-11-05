import { sweepHistoricalRecovery } from "@/lib/provider-evidence/recovery/historical";
import "server-only";
import { processRecoveryLookups } from "@/lib/provider-evidence/recovery/job";
import { sweepRecoveryCandidates } from "@/lib/provider-evidence/recovery/sweep";
import { recoverySwitches } from "@/lib/provider-evidence/recovery/switches";
import { maintainQueuedTaskCosts } from "@/lib/rank-check/queued-cost-recovery";
import { maintainRetainedRankResults } from "@/lib/rank-check/recovery-maintenance";
import { isScheduledMaintenanceEnabled } from "@/lib/temporal/maintenance-schedule-bootstrap";
import { providerRecoveryWorkflowStop } from "@/lib/temporal/provider-recovery-probe";
import { processRecoveryCommands } from "./execute";
import { logRecoveryFailure, runRecoveryStep } from "./processor-steps";

export function startRecoveryProcessor() {
  let closed = false,
    inFlight: Promise<void> | null = null,
    lastResults = 0;
  function tick() {
    if (closed || inFlight) return;
    inFlight = (async () => {
      await runRecoveryStep("commands", processRecoveryCommands);
      if (isScheduledMaintenanceEnabled() && Date.now() - lastResults >= 60000) {
        // Each step is isolated: one failing step must not starve the rest of the cycle.
        await runRecoveryStep("candidates", () =>
          sweepRecoveryCandidates(providerRecoveryWorkflowStop),
        );
        await runRecoveryStep("historical", () =>
          sweepHistoricalRecovery(providerRecoveryWorkflowStop),
        );
        await runRecoveryStep("lookups", processRecoveryLookups);
        await runRecoveryStep("retained-results", maintainRetainedRankResults);
        await runRecoveryStep("queued-costs", async () => {
          if (recoverySwitches().proofWrites) await maintainQueuedTaskCosts();
        });
        lastResults = Date.now();
      }
    })()
      // A throw outside the isolated steps (for example the schedule check) is still logged.
      .catch((error: unknown) => logRecoveryFailure("tick", error))
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
