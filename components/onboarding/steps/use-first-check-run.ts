"use client";

import { actionErrorMessage } from "@/components/onboarding/onboarding-form-utils";
import type {
  FirstCheckCandidate,
  ListFirstCheckCandidatesResult,
  ObservedPosition,
  RunFirstCheckPreviewResult,
} from "@/lib/actions/rank-check-preview";
import type {
  GetObservedPositionsInput,
  ListFirstCheckCandidatesInput,
  RunFirstCheckPreviewInput,
} from "@/lib/schemas/keyword";
import { useRef, useState, useSyncExternalStore } from "react";
import {
  candidateFromFailedRow,
  clientErrorRow,
  pendingRow,
  previewRow,
} from "./first-check-run-rows";
import { createFirstCheckRunStore, firstCheckRowsStatus } from "./first-check-run-store";

export type { FirstCheckResultRow, FirstCheckRunState } from "./first-check-run-rows";

export type FirstCheckRunActions = {
  getObservedPositionsAction?: (input: GetObservedPositionsInput) => Promise<ObservedPosition[]>;
  listFirstCheckCandidatesAction?: (
    input: ListFirstCheckCandidatesInput,
  ) => Promise<ListFirstCheckCandidatesResult>;
  runFirstCheckPreviewAction?: (
    input: RunFirstCheckPreviewInput,
  ) => Promise<RunFirstCheckPreviewResult>;
};

export function useFirstCheckRun(
  actions: FirstCheckRunActions,
  initialCandidates: FirstCheckCandidate[] = [],
  initialProjectId?: string | null,
) {
  const [store] = useState(() => createFirstCheckRunStore(initialCandidates, initialProjectId));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const { setState } = store;
  const projectRef = useRef<string | null>(initialProjectId ?? null);
  const runningRef = useRef(false);

  async function runCandidates(projectId: string, candidates: FirstCheckCandidate[]) {
    if (!actions.runFirstCheckPreviewAction) return;
    for (const candidate of candidates) {
      try {
        const result =
          candidate.previousResult ??
          (await actions.runFirstCheckPreviewAction({ keywordId: candidate.publicId }));
        const resultRow = previewRow(candidate, result);
        setState((current) => ({
          ...current,
          rows: current.rows.map((row) => (row.keywordId === candidate.id ? resultRow : row)),
        }));
        if (resultRow.status === "queued") store.track(projectId, resultRow);
      } catch (error) {
        setState((current) => ({
          ...current,
          rows: current.rows.map((row) =>
            row.keywordId === candidate.id ? clientErrorRow(candidate, error) : row,
          ),
        }));
      }
    }
  }

  async function runPreview(projectId: string, options: { keywordText: string; limit?: number }) {
    if (!actions.listFirstCheckCandidatesAction || !actions.runFirstCheckPreviewAction) {
      setState({
        message: "First-check preview is not available in this build.",
        mode: "preview",
        rows: [],
        status: "failed",
      });
      return;
    }

    setState({ message: null, mode: "preview", rows: [], status: "running" });
    try {
      const { candidates, isSampleProject, providerReady } =
        await actions.listFirstCheckCandidatesAction({
          includeExisting: true,
          keywordText: options.keywordText,
          ...(options.limit ? { limit: options.limit } : {}),
          projectId,
        });

      if (isSampleProject) {
        setState({
          message: "Sample projects don't run real checks.",
          mode: "preview",
          rows: [],
          status: "failed",
        });
        return;
      }

      if (!providerReady) {
        setState({
          message: "Connect a SERP provider before running checks.",
          mode: "preview",
          rows: [],
          status: "failed",
        });
        return;
      }

      if (candidates.length === 0) {
        setState({
          message: "This keyword is no longer available. Go back to choose a keyword.",
          mode: "preview",
          rows: [],
          status: "failed",
        });
        return;
      }

      setState({
        message: null,
        mode: "preview",
        rows: candidates.map((candidate) =>
          candidate.previousResult
            ? previewRow(candidate, candidate.previousResult)
            : pendingRow(candidate),
        ),
        status: "running",
      });
      await runCandidates(projectId, candidates);
      setState((current) => ({
        ...current,
        message: null,
        status: firstCheckRowsStatus(current.rows),
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        message: actionErrorMessage(error),
        status: "failed",
      }));
    }
  }

  async function start(input: { keywordText?: string; limit?: number; projectId: string | null }) {
    const status = store.getSnapshot().status;
    if (runningRef.current || status === "queued" || status === "running" || !input.projectId)
      return;
    projectRef.current = input.projectId;
    runningRef.current = true;
    try {
      if (!input.keywordText) {
        setState({
          message: "Select one keyword for the sample checks.",
          mode: "preview",
          rows: [],
          status: "failed",
        });
        return;
      }
      await runPreview(input.projectId, {
        keywordText: input.keywordText,
        limit: input.limit,
      });
    } finally {
      runningRef.current = false;
    }
  }

  async function retryFailed() {
    const current = store.getSnapshot();
    const projectId = projectRef.current;
    if (
      runningRef.current ||
      current.status === "queued" ||
      current.status === "running" ||
      !projectId ||
      !actions.runFirstCheckPreviewAction
    )
      return;
    const candidates = current.rows
      .filter((row) => row.status === "failed")
      .map(candidateFromFailedRow);
    if (candidates.length === 0) return;
    runningRef.current = true;
    setState((current) => ({
      ...current,
      message: null,
      rows: current.rows.map((row) =>
        row.status === "failed" ? pendingRow(candidateFromFailedRow(row)) : row,
      ),
      status: "running",
    }));
    try {
      await runCandidates(projectId, candidates);
      setState((current) => ({
        ...current,
        status: firstCheckRowsStatus(current.rows),
      }));
    } finally {
      runningRef.current = false;
    }
  }

  return { retryFailed, start, state };
}
