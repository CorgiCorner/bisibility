"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

function shouldPoll(active: boolean, job: CloudImportJobData) {
  return isRunning(job) || (active && !isTerminal(job));
}

function jobsEqual(left: CloudImportJobData, right: CloudImportJobData) {
  return (
    left.createdAt === right.createdAt &&
    left.error === right.error &&
    left.finishedAt === right.finishedAt &&
    left.id === right.id &&
    left.progress === right.progress &&
    left.startedAt === right.startedAt &&
    left.state === right.state &&
    JSON.stringify(left.counts) === JSON.stringify(right.counts)
  );
}

export function useCloudImportJobPoll({
  active,
  initialJob,
  onTerminal,
  pollAction,
  projectId,
}: UseCloudImportJobPollInput) {
  const [job, setJobState] = useState(initialJob);
  const jobRef = useRef(job);
  jobRef.current = job;

  const setJob = useCallback((update: Parameters<typeof setJobState>[0]) => {
    setJobState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      return jobsEqual(prev, next) ? prev : next;
    });
  }, []);

  const refresh = useCallback(async () => {
    const next = await pollAction({ projectId });
    setJob(next);
    if (isTerminal(next)) onTerminal?.(next);
    return next;
  }, [onTerminal, pollAction, projectId, setJob]);

  // Polling is synchronization with the persisted Cloud import job.
  useEffect(() => {
    if (!shouldPoll(active, jobRef.current)) return undefined;

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
      if (shouldPoll(active, next)) {
        timer = setTimeout(tick, 2000);
      }
    }

    timer = setTimeout(tick, 600);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, onTerminal, pollAction, projectId, setJob]);

  return { job, refresh, setJob };
}
