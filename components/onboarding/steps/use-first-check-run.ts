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
import { useRef, useState } from "react";
import {
  candidateFromFailedRow,
  clientErrorRow,
  type FirstCheckRunState,
  initialFirstCheckRunState,
  pendingRow,
  previewRow,
} from "./first-check-run-rows";

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

export function useFirstCheckRun(actions: FirstCheckRunActions) {
  const [state, setState] = useState<FirstCheckRunState>(initialFirstCheckRunState);
  const runningRef = useRef(false);

  async function runCandidates(candidates: FirstCheckCandidate[]) {
    if (!actions.runFirstCheckPreviewAction) return;
    for (const candidate of candidates) {
      try {
        const result = await actions.runFirstCheckPreviewAction({ keywordId: candidate.id });
        setState((current) => ({
          ...current,
          rows: current.rows.map((row) =>
            row.keywordId === candidate.id ? previewRow(candidate, result) : row,
          ),
        }));
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
          message: "No keywords are ready for a first check.",
          mode: "preview",
          rows: [],
          status: "completed",
        });
        return;
      }

      setState({
        message: null,
        mode: "preview",
        rows: candidates.map(pendingRow),
        status: "running",
      });
      await runCandidates(candidates);
      setState((current) => ({
        ...current,
        message: null,
        status: "completed",
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
    if (runningRef.current || !input.projectId) return;
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
    if (runningRef.current || !actions.runFirstCheckPreviewAction) return;
    const candidates = state.rows
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
      await runCandidates(candidates);
      setState((current) => ({ ...current, status: "completed" }));
    } finally {
      runningRef.current = false;
    }
  }

  return { retryFailed, start, state };
}
