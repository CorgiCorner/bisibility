"use client";

import { Button, Modal } from "@/components/ui";
import type { ProjectRef } from "@/lib/routing/app-path";
import { appPath } from "@/lib/routing/app-path";
import type { SerpDepth } from "@/lib/serp/markets";
import {
  CheckCircleIcon as CheckCircle,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";

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
      body: "The check failed: your rank data provider account has insufficient funds. Add funds or connect a different provider, then run the check again.",
      showOpenIntegrations: true,
      showTryAgain: true,
      showViewCheckDetails: false,
    };
  }
  if (errorCode === "provider_auth") {
    return {
      body: "The check failed: the rank data provider rejected the credentials. Reconnect the provider and run the check again.",
      showOpenIntegrations: true,
      showTryAgain: false,
      showViewCheckDetails: false,
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

  return (
    <div className="grid gap-3">
      <p className="m-0 text-[13px] leading-5 text-fg-muted">
        This manual run starts a Top {depth} check now, outside the schedule.
      </p>
      {costLabel ? (
        <p className="m-0 text-[13px] leading-5 text-fg">Estimated cost {costLabel}</p>
      ) : null}
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
    <div className="grid justify-items-start gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-[10px] text-green-text [background:color-mix(in_srgb,var(--green)_12%,transparent)]">
        <CheckCircle aria-hidden size={20} weight="bold" />
      </span>
      <p className="m-0 text-[13px] leading-5 text-fg-muted">
        {ranked
          ? `Ranked #${position} in the top ${depth}.`
          : `Not ranked in the top ${depth} yet.`}
      </p>
    </div>
  );
}

function FailedBody({
  errorCode,
  onTryAgain,
  projectRef,
  rankCheckId,
}: Readonly<
  Pick<KeywordFirstCheckModalProps, "errorCode" | "onTryAgain" | "projectRef" | "rankCheckId">
>) {
  const copy = failureCopy(errorCode);
  const checksHref = rankCheckId
    ? `${appPath(projectRef, "rank-tracker")}?tab=checks&run=${encodeURIComponent(rankCheckId)}`
    : `${appPath(projectRef, "rank-tracker")}?tab=checks`;
  const integrationsHref = appPath(projectRef, "integrations");
  return (
    <div className="grid justify-items-start gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-[10px] text-red-text [background:color-mix(in_srgb,var(--red)_12%,transparent)]">
        <WarningCircle aria-hidden size={20} weight="bold" />
      </span>
      <p className="m-0 text-[13px] leading-5 text-fg-muted">{copy.body}</p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {copy.showOpenIntegrations ? (
          <Button
            href={integrationsHref}
            type="button"
            variant={copy.showTryAgain ? "secondary" : "primary"}
          >
            Open integrations
          </Button>
        ) : null}
        {copy.showTryAgain ? (
          <Button onClick={onTryAgain} type="button">
            Try again
          </Button>
        ) : null}
        {copy.showViewCheckDetails ? (
          <Button href={checksHref} type="button" variant="secondary">
            View check details
          </Button>
        ) : null}
      </div>
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
    footer = null;
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
    ? "Run first check"
    : isRunning
      ? "Check running"
      : step === "success"
        ? "First check complete"
        : "Check failed";

  let body: React.ReactNode;
  if (isConfirm) {
    body = <ConfirmBody confirming={confirming} costLabel={costLabel} depth={depth} />;
  } else if (isRunning) {
    body = <RunningBody />;
  } else if (isFailed) {
    body = (
      <FailedBody
        errorCode={errorCode}
        onTryAgain={onTryAgain}
        projectRef={projectRef}
        rankCheckId={rankCheckId}
      />
    );
  } else {
    body = <SuccessBody depth={successDepth} position={position} />;
  }

  return (
    <Modal footer={footer} onClose={modalOnClose} open={open} size="sm" title={title}>
      {body}
    </Modal>
  );
}
