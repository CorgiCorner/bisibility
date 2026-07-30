"use client";

import { useCallback, useEffect, useState } from "react";
import type { CloudImportJobData } from "./cloud-token";

type PollAction = (input: { projectId: string }) => Promise<CloudImportJobData>;

type UseCloudImportJobPollInput = {
  active: boolean;
  initialJob: CloudImportJobData;
  onTerminal?: (job: CloudImportJobData) => void;
  pollAction: PollAction;
  projectId: string;
};

function isTerminal(job: CloudImportJobData) {
  return job.state === "done" || job.state === "failed";
}

function isRunning(job: CloudImportJobData) {
  return job.state === "receiving" || job.state === "importing";
}

export function useCloudImportJobPoll({
  active,
  initialJob,
  onTerminal,
  pollAction,
  projectId,
}: UseCloudImportJobPollInput) {
  const [job, setJob] = useState(initialJob);

  const refresh = useCallback(async () => {
    const next = await pollAction({ projectId });
    setJob(next);
    if (isTerminal(next)) onTerminal?.(next);
    return next;
  }, [onTerminal, pollAction, projectId]);

  // Polling is synchronization with the persisted Cloud import job.
  useEffect(() => {
    if (!active && !isRunning(job)) return undefined;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      const next = await pollAction({ projectId });
      if (cancelled) return;
      setJob(next);
      if (isTerminal(next)) {
        onTerminal?.(next);
        return;
      }
      if (isRunning(next) || active) {
        timer = setTimeout(tick, 2000);
      }
    }

    timer = setTimeout(tick, 600);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, job, onTerminal, pollAction, projectId]);

  return { job, refresh, setJob };
}
