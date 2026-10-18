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
  const [pollError, setPollError] = useState<unknown>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const retry = useCallback(() => setRetryVersion((value) => value + 1), []);
  const jobRef = useRef(job);
  jobRef.current = job;

  const applyJob = useCallback((update: Parameters<typeof setJobState>[0]) => {
    setJobState((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      return jobsEqual(prev, next) ? prev : next;
    });
  }, []);

  // Token creation can keep an identical idle job while starting a fresh polling session.
  const setJob = useCallback(
    (update: Parameters<typeof setJobState>[0]) => {
      applyJob(update);
      setPollError(null);
      setRetryVersion((value) => value + 1);
    },
    [applyJob],
  );

  const refresh = useCallback(async () => {
    const next = await pollAction({ projectId });
    setJob(next);
    if (isTerminal(next)) onTerminal?.(next);
    return next;
  }, [onTerminal, pollAction, projectId, setJob]);

  // Polling is synchronization with the persisted Cloud import job.
  useEffect(() => {
    if (!shouldPoll(active, jobRef.current)) {
      setPollError(null);
      return undefined;
    }

    let cancelled = false;
    let consecutiveTransportFailures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      let next: CloudImportJobData;
      try {
        next = await pollAction({ projectId });
      } catch (error) {
        if (cancelled) return;
        setPollError(() => error);
        // Only the status read is retried; persistent failures remain visible for manual retry.
        if (error instanceof TypeError && ++consecutiveTransportFailures <= 2) {
          timer = setTimeout(tick, 2000);
          return;
        }
        if (error instanceof TypeError) return;
        throw error;
      }
      if (cancelled) return;
      consecutiveTransportFailures = 0;
      setPollError(null);
      applyJob(next);
      if (isTerminal(next)) {
        onTerminal?.(next);
        return;
      }
      if (shouldPoll(active, next)) {
        timer = setTimeout(tick, 2000);
      }
    }

    timer = setTimeout(tick, retryVersion === 0 ? 600 : 0);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, applyJob, onTerminal, pollAction, projectId, retryVersion]);

  return { job, pollError, refresh, retry, setJob };
}
