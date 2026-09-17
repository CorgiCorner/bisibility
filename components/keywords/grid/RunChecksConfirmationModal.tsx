"use client";

import { RankCheckRunModal } from "@/components/keywords/RankCheckRunModal";
import { Button } from "@/components/ui/Button";
import { type CostRateInfo, runCostCents } from "@/lib/cost-estimate/project-estimate";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { dominantErrorCode, isProviderErrorCode } from "@/lib/providers/provider-error-code";
import type { KeywordRow } from "@/lib/queries/keywords";
import { providerFailurePresentation } from "@/lib/rank-check/failure-presentation";
import { appPath } from "@/lib/routing/app-path";
import { projectRunRankCheckPath, projectRunsPath } from "@/lib/routing/project-runs-path";
import type { SerpDepth } from "@/lib/serp/constants";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { effectiveRowDepth } from "./run-check-depth";

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

function flowTitle(
  flow: RunChecksFlow,
  t: ReturnType<
    typeof useTranslations<"projectRankTracker.keywordImport.management.runConfirmation">
  >,
) {
  const count = flow.pending.keywordIds.length;
  if (flow.step === "confirm" || flow.step === "starting") return t("titleConfirm", { count });
  if (flow.step === "running") return t("titleRunning", { count });
  if (flow.step === "success") return t("titleComplete", { count });
  return t("titleFailed", { count });
}

const SAFE_IMMEDIATE_BLOCK_CODES = new Set([
  "budget_exhausted",
  "check_in_progress",
  "sample_project",
]);

function dominantProviderCode(failures: RunChecksFailure[]) {
  const recognized = failures.flatMap((failure) => {
    return isProviderErrorCode(failure.code) ? [failure.code] : [];
  });
  return recognized.length > 0 ? dominantErrorCode(recognized) : null;
}

function deferredFailure(failures: RunChecksFailure[]) {
  return failures.find((failure) => failure.code === "rank_check_deferred") ?? null;
}

function providerMessage(
  code: string | null,
  t: ReturnType<
    typeof useTranslations<"projectRankTracker.keywordImport.management.runConfirmation">
  >,
) {
  if (code === "provider_billing") return t("providerBilling");
  if (code === "provider_account_restricted") return t("providerAccountRestricted");
  if (code === "provider_auth") return t("providerAuth");
  if (code === "provider_rate_limited") return t("providerRateLimited");
  if (code === "provider_transient") return t("providerUnavailable");
  return t("providerUnknown");
}

function FailureBody({
  failures,
  t,
}: {
  failures: RunChecksFailure[];
  t: ReturnType<
    typeof useTranslations<"projectRankTracker.keywordImport.management.runConfirmation">
  >;
}) {
  const first = failures[0];
  const deferred = deferredFailure(failures);
  const providerCode = dominantProviderCode(failures);
  const appBlock = first && SAFE_IMMEDIATE_BLOCK_CODES.has(first.code ?? "") ? first : null;
  const message = deferred?.message ?? appBlock?.message ?? providerMessage(providerCode, t);
  return (
    <div role="alert">
      <p className="m-0 text-[13px] leading-5 text-fg-muted">{message}</p>
      {failures.length > 1 ? (
        <p className="m-0 text-[12px] text-fg-muted">
          {t("checksNeedAttention", { count: failures.length })}
        </p>
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
  const t = useTranslations("projectRankTracker.keywordImport.management.runConfirmation");
  const runT = useTranslations("projectRankTracker.keywordImport.management.runChecks");
  const selectedRows = flow
    ? flow.pending.keywordIds.flatMap((id) => rows.find((row) => row.id === id) ?? [])
    : [];
  const depths = flow?.pending.depth
    ? selectedRows.map(() => flow.pending.depth as SerpDepth)
    : selectedRows.map(effectiveRowDepth);
  const estimatedCost = providerRate && flow ? runCostCents(depths, providerRate) : null;
  const count = flow?.pending.keywordIds.length ?? 0;
  const selectionDepths = new Set(selectedRows.map(effectiveRowDepth));
  const selectionDepth = selectionDepths.size === 1 ? selectionDepths.values().next().value : null;
  const depthLabel = flow?.pending.depth
    ? runT("top", { depth: flow.pending.depth })
    : selectionDepth != null
      ? runT("top", { depth: selectionDepth })
      : runT("keywordDefaults");
  const firstFailure = flow?.failures[0];
  const providerCode = flow ? dominantProviderCode(flow.failures) : null;
  const failurePresentation = providerFailurePresentation(providerCode);
  const failureRunId = firstFailure?.rankCheckId ?? null;
  const detailRunId = failureRunId && isPublicIdOfType(failureRunId, "rcr") ? failureRunId : null;
  const failureDetailsHref = detailRunId
    ? projectRunRankCheckPath(projectId, detailRunId)
    : projectRunsPath(projectId);

  let footer: React.ReactNode = null;
  if (flow?.step === "confirm" || flow?.step === "starting") {
    footer = (
      <div className="flex w-full justify-end gap-2">
        <Button disabled={flow.step === "starting"} onClick={onClose} variant="secondary">
          {t("cancel")}
        </Button>
        <Button loading={flow.step === "starting"} loadingLabel={t("starting")} onClick={onConfirm}>
          {t("confirmAndRun")}
        </Button>
      </div>
    );
  } else if (flow?.step === "running") {
    footer = (
      <div className="flex w-full justify-end">
        <Button onClick={onClose} variant="secondary">
          {t("close")}
        </Button>
      </div>
    );
  } else if (flow?.step === "success") {
    footer = (
      <div className="flex w-full justify-end">
        <Button onClick={onClose}>{t("continue")}</Button>
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
          {t("viewDetails")}
        </Link>
        <div className="flex items-center justify-end gap-2">
          {showRetry ? (
            <Button onClick={onRetry} variant="secondary">
              {t("tryAgain")}
            </Button>
          ) : null}
          {!deferred && failurePresentation.showOpenIntegrations ? (
            <Button href={appPath(projectId, "integrations")}>{t("openIntegrations")}</Button>
          ) : null}
        </div>
      </div>
    );
  }

  let body: React.ReactNode = null;
  if (flow?.step === "confirm" || flow?.step === "starting") {
    body = (
      <>
        <p className="m-0 mb-4 text-[12.5px] leading-5 text-fg-muted">{t("confirmDescription")}</p>
        <div className="overflow-hidden rounded-card border border-border">
          {[
            { label: t("keywords"), value: t("keywordsValue", { count }) },
            { label: t("depth"), value: depthLabel },
            {
              label: t("estimatedCost"),
              value:
                estimatedCost == null
                  ? t("unavailable")
                  : estimatedCost > 0 && estimatedCost < 1
                    ? t("estimatedCostBelowCent", { minimum: 0.01 })
                    : t("estimatedCostValue", { cost: estimatedCost / 100 }),
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
        {t("runningBody", { count: flow.rankCheckIds.length })}
      </p>
    );
  } else if (flow?.step === "success") {
    body = (
      <div>
        <p className="m-0 text-[13px] leading-5 text-fg-muted">
          {t("successBody", { count: flow.completed })}
        </p>
      </div>
    );
  } else if (flow?.step === "failed") body = <FailureBody failures={flow.failures} t={t} />;

  return (
    <RankCheckRunModal
      dismissDisabled={flow?.step === "starting"}
      footer={footer}
      onClose={onClose}
      onPrimaryAction={flow?.step === "confirm" ? onConfirm : undefined}
      open={flow !== null}
      size="sm"
      step={flow?.step ?? "confirm"}
      title={flow ? flowTitle(flow, t) : t("titleFallback")}
    >
      {body}
    </RankCheckRunModal>
  );
}
