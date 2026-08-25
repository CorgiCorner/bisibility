"use client";

import type { GetRankCheckStatusResult } from "@/lib/actions/rank-check-status";
import type { RunCheckNowInput } from "@/lib/schemas/keyword";
import type { SerpDepth } from "@/lib/serp/markets";
import { useCallback, useState } from "react";
import { actionErrorMessage, type KeywordAction } from "./action-utils";
import {
  keywordRunCheckBlockMessage,
  keywordRunCheckId,
  keywordRunCheckOutcome,
} from "./keyword-run-check-result";
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
  runCheckNowAction: KeywordAction<RunCheckNowInput>;
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
    if (!modal || confirming) return;
    setConfirming(true);
    setModal((prev) => (prev ? { ...prev, error: null } : prev));
    try {
      const result = await runCheckNowAction({ depth: modal.depth, keywordId });
      const outcome = keywordRunCheckOutcome(result);
      if (outcome === "blocked") {
        setModal((prev) =>
          prev
            ? {
                ...prev,
                error: keywordRunCheckBlockMessage(result, "The rank check could not be started."),
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
        setModal((prev) =>
          prev ? { ...prev, error: "The rank check could not be started." } : prev,
        );
        return;
      }
      setModal((prev) =>
        prev ? { ...prev, error: null, rankCheckId: checkId, step: "running" } : prev,
      );
    } catch (error) {
      setModal((prev) =>
        prev
          ? {
              ...prev,
              error: actionErrorMessage(error, "The first rank check could not be started."),
            }
          : prev,
      );
    } finally {
      setConfirming(false);
    }
  }, [keywordId, modal, confirming, runCheckNowAction, refresh]);

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
