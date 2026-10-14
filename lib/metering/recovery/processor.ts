import "server-only";
import { maintainRetainedRankResults } from "@/lib/rank-check/recovery-maintenance";
import { isScheduledMaintenanceEnabled } from "@/lib/temporal/maintenance-schedule-bootstrap";
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
