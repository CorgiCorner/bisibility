import { PaymentChargeLine } from "@/components/action-payment/PaymentChargeLine";
import type { ClientDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import { formatMeasuredPaymentAmount } from "@/lib/action-payment/format";
import { formatProviderCost } from "@/lib/checks/provider-cost-format";
import { providerLabel } from "@/lib/checks/provider-label";
import { isUnrunnableReason } from "@/lib/rank-check/runnable-reasons";
import type { useTranslations } from "next-intl";
import type { RunPageData, RunPageItem } from "./RunPageTypes";
import { localizedBlockedRunCopy } from "./rank-run-copy";
export function runTargetNote(
  item: RunPageItem,
  run: RunPageData,
  deploymentMode: ClientDeploymentMode,
  t: ReturnType<typeof useTranslations<"projectRuns.rankRuns">>,
  locale: string,
) {
  if (item.status === "queued" && !item.startedAt && run.status !== "blocked") return "";
  const failedAttempts =
    item.status === "completed"
      ? item.rankCheck?.attempts?.filter((attempt) => attempt.outcome !== "ok")
      : [];
  const completedProvider = item.rankCheck?.provider;
  if (failedAttempts?.length && completedProvider)
    return failedAttempts
      .map((attempt) =>
        t("targetPresentation.fallback", {
          failed: attempt.providerLabel,
          detail: attempt.detail ?? t("targetPresentation.providerUnknown"),
          completed: providerLabel(completedProvider),
        }),
      )
      .join(" ");
  if (item.blockedReason === "send_unconfirmed") return t("targetPresentation.sendUnconfirmed");
  if (
    item.blockedReason === "target_paused" ||
    item.blockedReason === "location_language_unavailable"
  ) {
    return localizedBlockedRunCopy({ deploymentMode, reason: item.blockedReason }, t, locale)
      .compact;
  }
  if (item.blockedReason === "schedule_changed") return t("targetPresentation.scheduleChanged");
  if (isUnrunnableReason(item.blockedReason)) {
    return localizedBlockedRunCopy({ deploymentMode, reason: item.blockedReason }, t, locale)
      .compact;
  }
  if (item.status === "skipped" || item.status === "blocked") {
    return item.startedAt
      ? t("targetPresentation.stoppedAfterStart")
      : t("targetPresentation.skippedBeforeStart");
  }
  if (run.status === "blocked" && item.status === "queued") {
    return localizedBlockedRunCopy(
      {
        budget: run.budget,
        deploymentMode,
        reason: run.blockedReason,
      },
      t,
      locale,
    ).compact;
  }
  if (item.rankCheck?.errorCode === "organic_depth_not_covered")
    return t("targetPresentation.organicDepthNotCovered");
  if (item.rankCheck?.errorCode === "provider_capacity_unavailable")
    return t("targetPresentation.providerCapacityUnavailable");
  if (item.rankCheck?.errorCode === "provider_billing")
    return t("targetPresentation.providerBilling");
  if (item.rankCheck?.errorCode === "provider_account_restricted")
    return t("targetPresentation.providerRestricted");
  if (item.rankCheck?.errorCode === "provider_auth") return t("targetPresentation.providerAuth");
  if (item.rankCheck?.errorCode === "provider_rate_limited")
    return t("targetPresentation.providerRateLimited");
  if (item.rankCheck?.errorCode === "provider_transient")
    return t("targetPresentation.providerTransient");
  return item.rankCheck?.errorCode ? t("targetPresentation.providerUnknown") : "";
}

const costTextClassName = "text-[12px] tabular-nums text-fg-muted";

export function targetCost(
  item: RunPageItem,
  locale: string,
  t: ReturnType<typeof useTranslations<"projectRuns.rankRuns">>,
) {
  if (item.payment)
    return (
      <PaymentChargeLine
        payment={item.payment}
        presented={
          item.payment.option.fundingSource === "byok"
            ? { text: formatMeasuredPaymentAmount(item.payment.charge, locale) }
            : undefined
        }
      />
    );
  if (item.status !== "completed" && item.status !== "failed") return null;
  return (
    <span className={costTextClassName}>
      {item.actualCostCents !== null
        ? formatProviderCost(item.actualCostCents, locale)
        : t("targetPresentation.costNotRecorded")}
    </span>
  );
}
