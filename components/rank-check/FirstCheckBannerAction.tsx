"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import {
  FirstCheckRunModal,
  type FirstCheckRunScope,
} from "@/components/rank-check/FirstCheckRunModal";
import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import type { FirstCheckRunPlan } from "@/lib/actions/rank-check-preview";
import { isBudgetExhaustedResult } from "@/lib/rank-check/budget-contract";
import { asProjectRef, type ProjectRef } from "@/lib/routing/app-path";
import {
  classifyActionError,
  presentActionError,
  type SharedErrorMessages,
} from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

export type RunFirstCheckAction = (input: { keywordId: string }) => Promise<unknown>;
export type GetFirstCheckRunPlanAction = (input: {
  projectId: string;
}) => Promise<FirstCheckRunPlan>;
export type QueueFirstChecksAction = (input: {
  excludeKeywordIds?: string[];
  projectId: string;
}) => Promise<unknown>;

function recoveryError(error: unknown, errors: SharedErrorMessages, fallback: string) {
  const kind = classifyActionError(error).kind;
  return kind === "staleDeployment" || kind === "serverComponentDigest"
    ? presentActionError(error, errors, fallback)
    : fallback;
}

function runResultError(
  result: unknown,
  t: ReturnType<typeof useTranslations<"shared.firstCheck">>,
) {
  if (!result || typeof result !== "object") return null;
  const value = result as { code?: unknown; status?: unknown };
  if (value.status !== "not_started" || typeof value.code !== "string") return null;
  switch (value.code) {
    case "budget_exhausted":
      return t("notices.budgetExhausted");
    case "check_in_progress":
      return t("errors.checkInProgress");
    case "keyword_archived":
      return t("errors.keywordArchived");
    case "market_inactive":
      return t("errors.marketInactive");
    case "no_provider":
      return t("notices.providerMissing");
    case "sample_project":
      return t("notices.sampleProject");
    default:
      return t("errors.start");
  }
}

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
  const errors = useSharedErrorMessages();
  const t = useTranslations("shared.firstCheck");
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
        setPlanError(recoveryError(error, errors, t("errors.loadPlan")));
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
        const resultError = isBudgetExhaustedResult(result)
          ? t("notices.budgetExhausted")
          : runResultError(result, t);
        if (resultError) {
          setConfirmError(resultError);
          return;
        }
        if (runScope === "all" && plan && plan.readyCount > 1) {
          await queueFirstChecksAction({ excludeKeywordIds: [keywordId], projectId });
        }
        router.refresh();
        setOpen(false);
      } catch (error: unknown) {
        setConfirmError(recoveryError(error, errors, t("errors.start")));
      }
    });
  }

  return (
    <>
      <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
        <ProjectReadOnlyTooltip>
          <Button disabled={readOnly} onClick={openModal} size="sm" type="button">
            {t("action")}
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
