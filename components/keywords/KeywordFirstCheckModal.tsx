"use client";

import { RankCheckRunModal } from "@/components/keywords/RankCheckRunModal";
import { Button } from "@/components/ui/Button";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import { projectRunRankCheckPath, projectRunsPath } from "@/lib/routing/project-runs-path";
import type { SerpDepth } from "@/lib/serp/constants";
import { useTranslations } from "next-intl";

export type KeywordFirstCheckModalStep = "confirm" | "running" | "success" | "failed";

export type KeywordFirstCheckModalProps = {
  confirmError: string | null;
  confirming: boolean;
  costLabel: string | null;
  depth: SerpDepth;
  errorCode: string | null;
  onClose: () => void;
  onConfirm: () => void;
  onContinue: () => void;
  onTryAgain: () => void;
  open: boolean;
  position: number | null;
  projectRef: ProjectRef;
  rankCheckId: string | null;
  requestedDepth: number | null;
  step: KeywordFirstCheckModalStep;
};

type FailureCopy = {
  messageKey:
    | "accountRestricted"
    | "billing"
    | "failed"
    | "providerAuth"
    | "rateLimited"
    | "transient"
    | "unknown";
  showOpenIntegrations: boolean;
  showTryAgain: boolean;
  showViewCheckDetails: boolean;
};

function failureCopy(errorCode: string | null): FailureCopy {
  if (errorCode === "provider_billing") {
    return {
      messageKey: "billing",
      showOpenIntegrations: true,
      showTryAgain: true,
      showViewCheckDetails: true,
    };
  }
  if (errorCode === "provider_account_restricted") {
    return {
      messageKey: "accountRestricted",
      showOpenIntegrations: true,
      showTryAgain: false,
      showViewCheckDetails: true,
    };
  }
  if (errorCode === "provider_auth") {
    return {
      messageKey: "providerAuth",
      showOpenIntegrations: true,
      showTryAgain: false,
      showViewCheckDetails: true,
    };
  }
  if (errorCode === "provider_rate_limited") {
    return {
      messageKey: "rateLimited",
      showOpenIntegrations: false,
      showTryAgain: true,
      showViewCheckDetails: true,
    };
  }
  if (errorCode === "provider_transient") {
    return {
      messageKey: "transient",
      showOpenIntegrations: false,
      showTryAgain: true,
      showViewCheckDetails: true,
    };
  }
  return {
    messageKey: errorCode === null ? "unknown" : "failed",
    showOpenIntegrations: false,
    showTryAgain: true,
    showViewCheckDetails: true,
  };
}

function ConfirmBody({
  confirming,
  costLabel,
  depth,
}: Readonly<Pick<KeywordFirstCheckModalProps, "confirming" | "costLabel" | "depth">>) {
  const t = useTranslations("projectRankTracker.keywordDetail.firstCheck");
  if (confirming) {
    return (
      <p className="m-0 text-[13px] leading-5 text-fg-muted" role="status">
        {t("processing")}
      </p>
    );
  }

  const rows = [
    { label: t("keywords"), value: t("oneKeyword") },
    { label: t("depth"), value: t("top", { depth }) },
    { label: t("estimatedCost"), value: costLabel ?? t("unavailable") },
  ];
  return (
    <div className="grid gap-4">
      <p className="m-0 text-[12.5px] leading-5 text-fg-muted">{t("confirmDescription")}</p>
      <div className="overflow-hidden rounded-card border border-border">
        {rows.map((row, index) => (
          <div
            className={`flex items-center justify-between gap-4 px-4 py-3 ${index % 2 === 0 ? "bg-bg-sunken" : "bg-bg-elev"}`}
            key={row.label}
          >
            <span className="text-[13px] text-fg-muted">{row.label}</span>
            <span className="font-sans tabular-nums text-[13px] font-semibold text-fg">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RunningBody() {
  const t = useTranslations("projectRankTracker.keywordDetail.firstCheck");
  return <p className="m-0 text-[13px] leading-5 text-fg-muted">{t("runningDescription")}</p>;
}

function SuccessBody({ depth, position }: Readonly<{ depth: number; position: number | null }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.firstCheck");
  const ranked = position != null && position > 0;
  return (
    <div>
      <p className="m-0 text-[13px] leading-5 text-fg-muted">
        {ranked ? t("ranked", { depth, position }) : t("notRanked", { depth })}
      </p>
    </div>
  );
}

function FailedBody({ errorCode }: Readonly<{ errorCode: string | null }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.firstCheck");
  const copy = failureCopy(errorCode);
  return (
    <div role="alert">
      <p className="m-0 text-[13px] leading-5 text-fg-muted">{t(copy.messageKey)}</p>
    </div>
  );
}

export function KeywordFirstCheckModal({
  confirmError,
  confirming,
  costLabel,
  depth,
  errorCode,
  onClose,
  onConfirm,
  onContinue,
  onTryAgain,
  open,
  position,
  projectRef,
  rankCheckId,
  requestedDepth,
  step,
}: Readonly<KeywordFirstCheckModalProps>) {
  const t = useTranslations("projectRankTracker.keywordDetail.firstCheck");
  const successDepth = requestedDepth ?? depth;
  const isRunning = step === "running";
  const isFailed = step === "failed";
  const isConfirm = step === "confirm";
  const modalOnClose = step === "success" ? onContinue : onClose;
  const failedCopy = failureCopy(errorCode);
  const detailRunId = rankCheckId && isPublicIdOfType(rankCheckId, "rcr") ? rankCheckId : null;
  const checksHref = detailRunId
    ? projectRunRankCheckPath(projectRef, detailRunId)
    : projectRunsPath(projectRef);

  let footer: React.ReactNode;
  if (isConfirm) {
    footer = (
      <div className="flex w-full flex-wrap items-center justify-end gap-2">
        {confirmError ? (
          <p className="m-0 mb-1 w-full text-[12px] leading-5 text-red-text" role="alert">
            {t("couldNotStart")}
          </p>
        ) : null}
        <Button disabled={confirming} onClick={onClose} type="button" variant="secondary">
          {t("cancel")}
        </Button>
        <Button loading={confirming} loadingLabel={t("starting")} onClick={onConfirm} type="button">
          {t("confirmAndRun")}
        </Button>
      </div>
    );
  } else if (isRunning) {
    footer = (
      <div className="flex w-full flex-wrap items-center justify-end gap-2">
        <Button onClick={onClose} type="button" variant="secondary">
          {t("close")}
        </Button>
      </div>
    );
  } else if (isFailed) {
    footer = (
      <div className="flex w-full flex-wrap items-center justify-end gap-2">
        {failedCopy.showViewCheckDetails ? (
          <Button href={checksHref} type="button" variant="secondary">
            {t("viewCheckDetails")}
          </Button>
        ) : null}
        {failedCopy.showTryAgain ? (
          <Button onClick={onTryAgain} type="button" variant="secondary">
            {t("tryAgain")}
          </Button>
        ) : null}
        {failedCopy.showOpenIntegrations ? (
          <Button href={appPath(projectRef, "integrations")} type="button">
            {t("openIntegrations")}
          </Button>
        ) : null}
      </div>
    );
  } else {
    footer = (
      <div className="flex w-full flex-wrap items-center justify-end gap-2">
        <Button onClick={onContinue} type="button">
          {t("continue")}
        </Button>
      </div>
    );
  }

  const title = isConfirm
    ? t("runTitle")
    : isRunning
      ? t("runningTitle")
      : step === "success"
        ? t("completeTitle")
        : t("failedTitle");

  let body: React.ReactNode;
  if (isConfirm) {
    body = <ConfirmBody confirming={confirming} costLabel={costLabel} depth={depth} />;
  } else if (isRunning) {
    body = <RunningBody />;
  } else if (isFailed) {
    body = <FailedBody errorCode={errorCode} />;
  } else {
    body = <SuccessBody depth={successDepth} position={position} />;
  }

  return (
    <RankCheckRunModal
      footer={footer}
      onClose={modalOnClose}
      open={open}
      size="sm"
      step={confirming ? "starting" : step}
      title={title}
    >
      {body}
    </RankCheckRunModal>
  );
}
