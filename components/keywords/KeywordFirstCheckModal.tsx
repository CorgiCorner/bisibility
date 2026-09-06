"use client";

import { RankCheckRunModal } from "@/components/keywords/RankCheckRunModal";
import { Button } from "@/components/ui";
import { providerFailurePresentation } from "@/lib/rank-check/failure-presentation";
import { appPath, type ProjectRef, rankTrackerTabPath } from "@/lib/routing/app-path";
import type { SerpDepth } from "@/lib/serp/markets";

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
  body: string;
  showOpenIntegrations: boolean;
  showTryAgain: boolean;
  showViewCheckDetails: boolean;
};

function failureCopy(errorCode: string | null): FailureCopy {
  if (errorCode === "provider_billing") {
    return {
      body: "Your rank data provider account has insufficient funds. Add funds or connect a different provider, then run the check again.",
      showOpenIntegrations: true,
      showTryAgain: true,
      showViewCheckDetails: true,
    };
  }
  if (errorCode === "provider_auth") {
    return {
      body: "The rank data provider rejected the credentials. Reconnect the provider and run the check again.",
      showOpenIntegrations: true,
      showTryAgain: false,
      showViewCheckDetails: true,
    };
  }
  return {
    body: "The check failed after several attempts. This is usually temporary - try again in a few minutes.",
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
  if (confirming) {
    return (
      <p className="m-0 text-[13px] leading-5 text-fg-muted" role="status">
        The check is processing now.
      </p>
    );
  }

  const rows = [
    { label: "Keywords", value: "1 keyword" },
    { label: "Depth", value: `Top ${depth}` },
    { label: "Estimated cost", value: costLabel ?? "Unavailable" },
  ];
  return (
    <div className="grid gap-4">
      <p className="m-0 text-[12.5px] leading-5 text-fg-muted">
        Confirm this manual run before it is sent to the provider.
      </p>
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
  return (
    <p className="m-0 text-[13px] leading-5 text-fg-muted">
      Check running. This usually takes about a minute. You can close this window - the result will
      appear on this page.
    </p>
  );
}

function SuccessBody({ depth, position }: Readonly<{ depth: number; position: number | null }>) {
  const ranked = position != null && position > 0;
  return (
    <div>
      <p className="m-0 text-[13px] leading-5 text-fg-muted">
        {ranked
          ? `Ranked #${position} in the top ${depth}.`
          : `Not ranked in the top ${depth} yet.`}
      </p>
    </div>
  );
}

const SAFE_IMMEDIATE_BLOCK_CODES = new Set([
  "budget_exhausted",
  "check_in_progress",
  "sample_project",
]);

function FailedBody({
  errorCode,
  message,
}: Readonly<{ errorCode: string | null; message: string | null }>) {
  const safeMessage =
    message && SAFE_IMMEDIATE_BLOCK_CODES.has(errorCode ?? "")
      ? message
      : providerFailurePresentation(errorCode).message;
  return (
    <div role="alert">
      <p className="m-0 text-[13px] leading-5 text-fg-muted">{safeMessage}</p>
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
  const successDepth = requestedDepth ?? depth;
  const isRunning = step === "running";
  const isFailed = step === "failed";
  const isConfirm = step === "confirm";
  const modalOnClose = step === "success" ? onContinue : onClose;
  const failedCopy = failureCopy(errorCode);
  const checksHref = rankCheckId
    ? `${rankTrackerTabPath(projectRef, "runs")}&run=${encodeURIComponent(rankCheckId)}`
    : rankTrackerTabPath(projectRef, "runs");

  let footer: React.ReactNode;
  if (isConfirm) {
    footer = (
      <div className="flex w-full flex-wrap items-center justify-end gap-2">
        {confirmError ? (
          <p className="m-0 mb-1 w-full text-[12px] leading-5 text-red-text" role="alert">
            {confirmError}
          </p>
        ) : null}
        <Button disabled={confirming} onClick={onClose} type="button" variant="secondary">
          Cancel
        </Button>
        <Button loading={confirming} loadingLabel="Starting..." onClick={onConfirm} type="button">
          Confirm and run
        </Button>
      </div>
    );
  } else if (isRunning) {
    footer = (
      <div className="flex w-full flex-wrap items-center justify-end gap-2">
        <Button onClick={onClose} type="button" variant="secondary">
          Close
        </Button>
      </div>
    );
  } else if (isFailed) {
    footer = (
      <div className="flex w-full flex-wrap items-center justify-end gap-2">
        {failedCopy.showViewCheckDetails ? (
          <Button href={checksHref} type="button" variant="secondary">
            View check details
          </Button>
        ) : null}
        {failedCopy.showTryAgain ? (
          <Button onClick={onTryAgain} type="button" variant="secondary">
            Try again
          </Button>
        ) : null}
        {failedCopy.showOpenIntegrations ? (
          <Button href={appPath(projectRef, "integrations")} type="button">
            Open integrations
          </Button>
        ) : null}
      </div>
    );
  } else {
    footer = (
      <div className="flex w-full flex-wrap items-center justify-end gap-2">
        <Button onClick={onContinue} type="button">
          Continue
        </Button>
      </div>
    );
  }

  const title = isConfirm
    ? "Run rank check"
    : isRunning
      ? "Check running"
      : step === "success"
        ? "Check complete"
        : "Check failed";

  let body: React.ReactNode;
  if (isConfirm) {
    body = <ConfirmBody confirming={confirming} costLabel={costLabel} depth={depth} />;
  } else if (isRunning) {
    body = <RunningBody />;
  } else if (isFailed) {
    body = <FailedBody errorCode={errorCode} message={confirmError} />;
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
