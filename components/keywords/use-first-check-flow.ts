"use client";

import type { GetRankCheckStatusResult } from "@/lib/actions/rank-check-status";
import type { SerpDepth } from "@/lib/serp/constants";
import { useCallback, useRef, useState } from "react";
import type { RunCheckNowAction } from "./action-utils";
import { keywordRunCheckId, keywordRunCheckOutcome } from "./keyword-run-check-result";
import { type RankCheckPollAction, useRankCheckPoll } from "./use-rank-check-poll";

export type FirstCheckStep = "confirm" | "running" | "success" | "failed";

export type FirstCheckModalState = {
  depth: SerpDepth;
  error: string | null;
  errorCode: string | null;
  position: number | null;
  rankCheckId: string | null;
  requestedDepth: number | null;
  step: FirstCheckStep;
};

export type UseFirstCheckFlowInput = {
  keywordId: string;
  pollAction?: RankCheckPollAction;
  refresh: () => void;
  runCheckNowAction: RunCheckNowAction;
};

export type UseFirstCheckFlowResult = {
  closeCheckModal: () => void;
  confirmRun: () => Promise<void>;
  confirming: boolean;
  continueFromSuccess: () => void;
  modal: FirstCheckModalState | null;
  modalOpen: boolean;
  openCheckModal: (depth: SerpDepth) => void;
  tryAgain: () => void;
};

function resultPosition(result: unknown): number | null {
  if (!result || typeof result !== "object" || !("position" in result)) return null;
  const pos = (result as { position?: unknown }).position;
  return typeof pos === "number" ? pos : null;
}

function resultRequestedDepth(result: unknown): number | null {
  if (!result || typeof result !== "object" || !("requestedDepth" in result)) return null;
  const depth = (result as { requestedDepth?: unknown }).requestedDepth;
  return typeof depth === "number" ? depth : null;
}

function initialState(depth: SerpDepth): FirstCheckModalState {
  return {
    depth,
    error: null,
    errorCode: null,
    position: null,
    rankCheckId: null,
    requestedDepth: null,
    step: "confirm",
  };
}

export function useFirstCheckFlow({
  keywordId,
  pollAction,
  refresh,
  runCheckNowAction,
}: Readonly<UseFirstCheckFlowInput>): UseFirstCheckFlowResult {
  const [modal, setModal] = useState<FirstCheckModalState | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const submitting = useRef(false);

  const activeRankCheckId =
    modal?.step === "running" && modal.rankCheckId ? modal.rankCheckId : null;

  const handleTerminal = useCallback(
    (result: GetRankCheckStatusResult) => {
      if (result.status === "completed") {
        setModal((prev) =>
          prev
            ? {
                ...prev,
                position: result.position,
                requestedDepth: result.requestedDepth,
                step: "success",
              }
            : prev,
        );
        refresh();
      } else {
        setModal((prev) =>
          prev ? { ...prev, errorCode: result.errorCode, step: "failed" } : prev,
        );
      }
    },
    [refresh],
  );

  useRankCheckPoll({ onTerminal: handleTerminal, pollAction, rankCheckId: activeRankCheckId });

  const openCheckModal = useCallback((depth: SerpDepth) => {
    setModal((prev) => {
      if (prev && prev.step !== "confirm") return prev;
      return initialState(depth);
    });
    setModalOpen(true);
  }, []);

  const closeCheckModal = useCallback(() => {
    if (confirming) return;
    setModalOpen(false);
    setModal((prev) => {
      if (!prev || prev.step === "running") return prev;
      return null;
    });
  }, [confirming]);

  const continueFromSuccess = useCallback(() => {
    setModalOpen(false);
    setModal(null);
    refresh();
  }, [refresh]);

  const tryAgain = useCallback(() => {
    setModal((prev) =>
      prev
        ? {
            depth: prev.depth,
            error: null,
            errorCode: null,
            position: null,
            rankCheckId: null,
            requestedDepth: null,
            step: "confirm",
          }
        : prev,
    );
  }, []);

  const confirmRun = useCallback(async () => {
    if (modal?.step !== "confirm" || submitting.current) return;
    submitting.current = true;
    setConfirming(true);
    setModal((prev) => (prev ? { ...prev, error: null } : prev));
    try {
      const result = await runCheckNowAction({ depth: modal.depth, keywordId });
      const outcome = keywordRunCheckOutcome(result);
      if (outcome === "blocked") {
        const code =
          result &&
          typeof result === "object" &&
          "code" in result &&
          typeof result.code === "string"
            ? result.code
            : null;
        setModal((prev) =>
          prev
            ? {
                ...prev,
                error: "blocked",
                errorCode: code,
                step: code === "sample_project" ? "failed" : "confirm",
              }
            : prev,
        );
        return;
      }
      if (outcome === "completed") {
        setModal((prev) =>
          prev
            ? {
                ...prev,
                position: resultPosition(result),
                rankCheckId: keywordRunCheckId(result),
                requestedDepth: resultRequestedDepth(result),
                step: "success",
              }
            : prev,
        );
        refresh();
        return;
      }
      const checkId = keywordRunCheckId(result);
      if (!checkId) {
        setModal((prev) => (prev ? { ...prev, error: "not_started" } : prev));
        return;
      }
      setModal((prev) =>
        prev ? { ...prev, error: null, rankCheckId: checkId, step: "running" } : prev,
      );
    } catch {
      setModal((prev) =>
        prev
          ? {
              ...prev,
              error: "request_failed",
              errorCode: null,
              step: "failed",
            }
          : prev,
      );
    } finally {
      submitting.current = false;
      setConfirming(false);
    }
  }, [keywordId, modal, runCheckNowAction, refresh]);

  return {
    closeCheckModal,
    confirmRun,
    confirming,
    continueFromSuccess,
    modal,
    modalOpen,
    openCheckModal,
    tryAgain,
  };
}
