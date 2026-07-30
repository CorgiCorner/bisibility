"use client";

import {
  FirstCheckRunModal,
  type FirstCheckRunScope,
} from "@/components/rank-check/FirstCheckRunModal";
import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui";
import type { FirstCheckRunPlan } from "@/lib/actions/rank-check-preview";
import { isBudgetExhaustedResult } from "@/lib/rank-check/budget-contract";
import { asProjectRef, type ProjectRef } from "@/lib/routing/app-path";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { ArrowsClockwiseIcon as ArrowsClockwise } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export type RunFirstCheckAction = (input: { keywordId: string }) => Promise<unknown>;
export type GetFirstCheckRunPlanAction = (input: {
  projectId: string;
}) => Promise<FirstCheckRunPlan>;
export type QueueFirstChecksAction = (input: {
  excludeKeywordIds?: string[];
  projectId: string;
}) => Promise<unknown>;

type FirstCheckBannerActionProps = {
  getFirstCheckRunPlanAction: GetFirstCheckRunPlanAction;
  keywordId: string;
  projectId: string;
  projectRef?: ProjectRef;
  queueFirstChecksAction: QueueFirstChecksAction;
  runCheckNowAction: RunFirstCheckAction;
};

export function FirstCheckBannerAction({
  getFirstCheckRunPlanAction,
  keywordId,
  projectId,
  projectRef,
  queueFirstChecksAction,
  runCheckNowAction,
}: Readonly<FirstCheckBannerActionProps>) {
  const router = useRouter();
  const { readOnly } = useProjectWriteMode();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<FirstCheckRunPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [runScope, setRunScope] = useState<FirstCheckRunScope>("first");
  const [loading, startLoadingTransition] = useTransition();
  const [confirming, startConfirmTransition] = useTransition();

  function loadPlan() {
    setPlanError(null);
    startLoadingTransition(async () => {
      try {
        setPlan(await getFirstCheckRunPlanAction({ projectId }));
      } catch (error: unknown) {
        setPlanError(actionErrorMessage(error, "Run details could not be loaded."));
      }
    });
  }

  function openModal() {
    setOpen(true);
    setPlan(null);
    setConfirmError(null);
    setRunScope("first");
    loadPlan();
  }

  function closeModal() {
    setOpen(false);
  }

  function confirmRun() {
    setConfirmError(null);
    startConfirmTransition(async () => {
      try {
        const result = await runCheckNowAction({ keywordId });
        if (isBudgetExhaustedResult(result)) {
          setConfirmError(result.message);
          return;
        }
        if (runScope === "all" && plan && plan.readyCount > 1) {
          await queueFirstChecksAction({ excludeKeywordIds: [keywordId], projectId });
        }
        router.refresh();
        setOpen(false);
      } catch (error: unknown) {
        setConfirmError(actionErrorMessage(error, "The first rank check could not be started."));
      }
    });
  }

  return (
    <>
      <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
        <ProjectReadOnlyTooltip>
          <Button
            disabled={readOnly}
            onClick={openModal}
            size="sm"
            startIcon={<ArrowsClockwise aria-hidden size={14} weight="bold" />}
            type="button"
          >
            Run first check
          </Button>
        </ProjectReadOnlyTooltip>
      </div>
      <FirstCheckRunModal
        confirmError={confirmError}
        confirming={confirming}
        error={planError}
        loading={loading}
        onClose={closeModal}
        onConfirm={confirmRun}
        onRetry={loadPlan}
        onRunScopeChange={setRunScope}
        open={open}
        plan={plan}
        projectRef={projectRef ?? asProjectRef(projectId)}
        runScope={runScope}
      />
    </>
  );
}
