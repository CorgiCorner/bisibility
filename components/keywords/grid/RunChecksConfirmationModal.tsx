"use client";

import { RankCheckRunModal } from "@/components/keywords/RankCheckRunModal";
import { Button } from "@/components/ui";
import {
  type CostRateInfo,
  formatEstimateCents,
  runCostCents,
} from "@/lib/cost-estimate/project-estimate";
import { dominantErrorCode, isProviderErrorCode } from "@/lib/providers/provider-error-code";
import type { KeywordRow } from "@/lib/queries/keywords";
import { providerFailurePresentation } from "@/lib/rank-check/failure-presentation";
import { appPath, rankTrackerTabPath } from "@/lib/routing/app-path";
import type { SerpDepth } from "@/lib/serp/markets";
import Link from "next/link";
import { effectiveRowDepth, selectionDepthLabel } from "./run-check-depth";

export type PendingRunChecks = { depth?: SerpDepth; keywordIds: string[] };
export type RunChecksFailure = { code: string | null; message: string; rankCheckId: string | null };
export type RunChecksFlow = {
  completed: number;
  failures: RunChecksFailure[];
  pending: PendingRunChecks;
  rankCheckIds: string[];
  step: "confirm" | "starting" | "running" | "success" | "failed";
};

type Props = {
  flow: RunChecksFlow | null;
  onClose: () => void;
  onConfirm: () => void;
  onRetry: () => void;
  projectId: string;
  providerRate?: CostRateInfo;
  rows: KeywordRow[];
};

function flowTitle(flow: RunChecksFlow) {
  const plural = flow.pending.keywordIds.length !== 1;
  if (flow.step === "confirm" || flow.step === "starting")
    return `Run rank ${plural ? "checks" : "check"}`;
  if (flow.step === "running") return plural ? "Checks running" : "Check running";
  if (flow.step === "success") return plural ? "Checks complete" : "Check complete";
  return plural ? "Checks failed" : "Check failed";
}

const SAFE_IMMEDIATE_BLOCK_CODES = new Set([
  "budget_exhausted",
  "check_in_progress",
  "sample_project",
]);

function dominantProviderCode(failures: RunChecksFailure[]) {
  const recognized = failures.flatMap((failure) =>
    isProviderErrorCode(failure.code) ? [failure.code] : [],
  );
  return recognized.length > 0 ? dominantErrorCode(recognized) : null;
}

function deferredFailure(failures: RunChecksFailure[]) {
  return failures.find((failure) => failure.code === "rank_check_deferred") ?? null;
}

function FailureBody({ failures }: { failures: RunChecksFailure[] }) {
  const first = failures[0];
  const deferred = deferredFailure(failures);
  const providerCode = dominantProviderCode(failures);
  const appBlock = first && SAFE_IMMEDIATE_BLOCK_CODES.has(first.code ?? "") ? first : null;
  const message =
    deferred?.message ?? appBlock?.message ?? providerFailurePresentation(providerCode).message;
  return (
    <div role="alert">
      <p className="m-0 text-[13px] leading-5 text-fg-muted">{message}</p>
      {failures.length > 1 ? (
        <p className="m-0 text-[12px] text-fg-muted">{failures.length} checks need attention.</p>
      ) : null}
    </div>
  );
}

export function RunChecksConfirmationModal({
  flow,
  onClose,
  onConfirm,
  onRetry,
  projectId,
  providerRate,
  rows,
}: Readonly<Props>) {
  const selectedRows = flow
    ? flow.pending.keywordIds.flatMap((id) => rows.find((row) => row.id === id) ?? [])
    : [];
  const depths = flow?.pending.depth
    ? selectedRows.map(() => flow.pending.depth as SerpDepth)
    : selectedRows.map(effectiveRowDepth);
  const estimatedCost = providerRate && flow ? runCostCents(depths, providerRate) : null;
  const count = flow?.pending.keywordIds.length ?? 0;
  const depthLabel = flow?.pending.depth
    ? `Top ${flow.pending.depth}`
    : selectionDepthLabel(selectedRows);
  const firstFailure = flow?.failures[0];
  const providerCode = flow ? dominantProviderCode(flow.failures) : null;
  const failurePresentation = providerFailurePresentation(providerCode);
  const failureDetailsHref = firstFailure?.rankCheckId
    ? `${rankTrackerTabPath(projectId, "runs")}&run=${encodeURIComponent(firstFailure.rankCheckId)}`
    : rankTrackerTabPath(projectId, "runs");

  let footer: React.ReactNode = null;
  if (flow?.step === "confirm" || flow?.step === "starting") {
    footer = (
      <div className="flex w-full justify-end gap-2">
        <Button disabled={flow.step === "starting"} onClick={onClose} variant="secondary">
          Cancel
        </Button>
        <Button loading={flow.step === "starting"} loadingLabel="Starting..." onClick={onConfirm}>
          Confirm and run
        </Button>
      </div>
    );
  } else if (flow?.step === "running") {
    footer = (
      <div className="flex w-full justify-end">
        <Button onClick={onClose} variant="secondary">
          Close
        </Button>
      </div>
    );
  } else if (flow?.step === "success") {
    footer = (
      <div className="flex w-full justify-end">
        <Button onClick={onClose}>Continue</Button>
      </div>
    );
  } else if (flow?.step === "failed") {
    const appBlock =
      !providerCode && firstFailure && SAFE_IMMEDIATE_BLOCK_CODES.has(firstFailure.code ?? "");
    const deferred = deferredFailure(flow.failures);
    const showRetry = Boolean(appBlock || deferred || failurePresentation.showRetry);
    footer = (
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <Link
          className="text-[13px] font-medium text-accent-text underline-offset-4 hover:underline"
          href={failureDetailsHref}
        >
          View check details
        </Link>
        <div className="flex items-center justify-end gap-2">
          {showRetry ? (
            <Button onClick={onRetry} variant="secondary">
              Try again
            </Button>
          ) : null}
          {!deferred && failurePresentation.showOpenIntegrations ? (
            <Button href={appPath(projectId, "integrations")}>Open integrations</Button>
          ) : null}
        </div>
      </div>
    );
  }

  let body: React.ReactNode = null;
  if (flow?.step === "confirm" || flow?.step === "starting") {
    body = (
      <>
        <p className="m-0 mb-4 text-[12.5px] leading-5 text-fg-muted">
          Confirm this manual run before it is sent to the provider.
        </p>
        <div className="overflow-hidden rounded-card border border-border">
          {[
            { label: "Keywords", value: `${count} keyword${count === 1 ? "" : "s"}` },
            { label: "Depth", value: depthLabel },
            {
              label: "Estimated cost",
              value:
                estimatedCost == null ? "Unavailable" : `~${formatEstimateCents(estimatedCost)}`,
            },
          ].map((row, index) => (
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
      </>
    );
  } else if (flow?.step === "running") {
    body = (
      <p className="m-0 text-[13px] leading-5 text-fg-muted" role="status">
        {flow.rankCheckIds.length === 1
          ? "Check running"
          : `${flow.rankCheckIds.length} checks running`}
        . You can close this window - results will appear on this page.
      </p>
    );
  } else if (flow?.step === "success") {
    body = (
      <div>
        <p className="m-0 text-[13px] leading-5 text-fg-muted">
          {flow.completed} rank {flow.completed === 1 ? "check has" : "checks have"} completed.
        </p>
      </div>
    );
  } else if (flow?.step === "failed") body = <FailureBody failures={flow.failures} />;

  return (
    <RankCheckRunModal
      dismissDisabled={flow?.step === "starting"}
      footer={footer}
      onClose={onClose}
      onPrimaryAction={flow?.step === "confirm" ? onConfirm : undefined}
      open={flow !== null}
      size="sm"
      step={flow?.step ?? "confirm"}
      title={flow ? flowTitle(flow) : "Run rank checks"}
    >
      {body}
    </RankCheckRunModal>
  );
}
