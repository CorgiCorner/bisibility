"use client";

import { actionErrorMessage } from "@/components/onboarding/onboarding-form-utils";
import type {
  FirstCheckCandidate,
  FirstCheckPreviewFailureCode,
  ListFirstCheckCandidatesResult,
  ObservedPosition,
  RunFirstCheckPreviewResult,
} from "@/lib/actions/rank-check-preview";
import {
  type GetObservedPositionsInput,
  type ListFirstCheckCandidatesInput,
  type QueueFirstChecksInput,
  queueFirstChecksSchema,
  type RunFirstCheckPreviewInput,
} from "@/lib/schemas/keyword";
import { useRef, useState } from "react";

export type FirstCheckResultRow =
  | {
      keywordId: string;
      publicId?: string;
      status: "pending";
      text: string;
    }
  | {
      keywordId: string;
      provider: string;
      publicId?: string;
      position: number | null;
      rankingUrl: string | null;
      status: "completed";
      text: string;
    }
  | {
      code: FirstCheckPreviewFailureCode | "client_error";
      keywordId: string;
      message: string;
      publicId?: string;
      status: "failed";
      text: string;
    }
  | {
      clicks: number;
      impressions: number;
      keywordId: string;
      position: number;
      status: "observed";
      text: string;
    };

export type FirstCheckRunState = {
  message: string | null;
  mode: "observed" | "preview";
  rows: FirstCheckResultRow[];
  status: "completed" | "failed" | "idle" | "running";
};

export type FirstCheckRunActions = {
  getObservedPositionsAction?: (input: GetObservedPositionsInput) => Promise<ObservedPosition[]>;
  listFirstCheckCandidatesAction?: (
    input: ListFirstCheckCandidatesInput,
  ) => Promise<ListFirstCheckCandidatesResult>;
  queueFirstChecksAction?: (input: QueueFirstChecksInput) => Promise<unknown>;
  runFirstCheckPreviewAction?: (
    input: RunFirstCheckPreviewInput,
  ) => Promise<RunFirstCheckPreviewResult>;
};

const initialState: FirstCheckRunState = {
  message: null,
  mode: "preview",
  rows: [],
  status: "idle",
};

function pendingRow(candidate: FirstCheckCandidate): FirstCheckResultRow {
  return {
    keywordId: candidate.id,
    publicId: candidate.publicId,
    status: "pending",
    text: candidate.text,
  };
}

function previewRow(
  candidate: FirstCheckCandidate,
  result: RunFirstCheckPreviewResult,
): FirstCheckResultRow {
  if (result.status === "completed") {
    return {
      keywordId: candidate.id,
      position: result.position,
      provider: result.provider,
      publicId: candidate.publicId,
      rankingUrl: result.rankingUrl,
      status: "completed",
      text: candidate.text,
    };
  }

  return {
    code: result.code,
    keywordId: candidate.id,
    message: result.message,
    publicId: candidate.publicId,
    status: "failed",
    text: candidate.text,
  };
}

function clientErrorRow(candidate: FirstCheckCandidate, error: unknown): FirstCheckResultRow {
  return {
    code: "client_error",
    keywordId: candidate.id,
    message: actionErrorMessage(error),
    publicId: candidate.publicId,
    status: "failed",
    text: candidate.text,
  };
}

function observedRow(position: ObservedPosition): FirstCheckResultRow {
  return {
    clicks: position.clicks,
    impressions: position.impressions,
    keywordId: position.keywordId,
    position: position.position,
    status: "observed",
    text: position.text,
  };
}

export function useFirstCheckRun(actions: FirstCheckRunActions) {
  const [state, setState] = useState<FirstCheckRunState>(initialState);
  const runningRef = useRef(false);

  async function showObservedPositions(projectId: string) {
    if (!actions.getObservedPositionsAction) {
      setState({
        message: "Observed positions are not available in this build.",
        mode: "observed",
        rows: [],
        status: "failed",
      });
      return;
    }

    setState({ message: null, mode: "observed", rows: [], status: "running" });
    try {
      const positions = await actions.getObservedPositionsAction({ projectId });
      setState({
        message:
          positions.length === 0
            ? "Search Console query snapshots can lag by about 3 days, so new sites may not show observed positions yet."
            : null,
        mode: "observed",
        rows: positions.map(observedRow),
        status: "completed",
      });
    } catch (error) {
      setState({
        message: actionErrorMessage(error),
        mode: "observed",
        rows: [],
        status: "failed",
      });
    }
  }

  async function runPreview(projectId: string) {
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
      const { candidates, hasAnalyticsSource, isSampleProject, providerReady } =
        await actions.listFirstCheckCandidatesAction({ projectId });

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
        if (hasAnalyticsSource) {
          await showObservedPositions(projectId);
          return;
        }
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
      const completedKeywordIds: string[] = [];
      for (const candidate of candidates) {
        try {
          const result = await actions.runFirstCheckPreviewAction({ keywordId: candidate.id });
          if (result.status === "completed") {
            completedKeywordIds.push(candidate.id);
          }
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
      if (actions.queueFirstChecksAction) {
        await actions.queueFirstChecksAction(
          queueFirstChecksSchema.parse({
            excludeKeywordIds: completedKeywordIds,
            projectId,
          }),
        );
      }
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

  async function start(input: { mode: "observed" | "preview"; projectId: string | null }) {
    if (runningRef.current || !input.projectId) return;
    runningRef.current = true;
    try {
      if (input.mode === "observed") {
        await showObservedPositions(input.projectId);
        return;
      }
      await runPreview(input.projectId);
    } finally {
      runningRef.current = false;
    }
  }

  return { start, state };
}
