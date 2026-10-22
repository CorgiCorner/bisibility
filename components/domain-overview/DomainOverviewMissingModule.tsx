"use client";

import { ActionPaymentPrice } from "@/components/action-payment/ActionPaymentPrice";
import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useDomainOverviewCacheDuration } from "./DomainOverviewCacheProvider";
import { DomainOverviewNoDataCard } from "./DomainOverviewStatePanel";

const UNLOADABLE_ROW_REASONS = new Set([
  "budget_exhausted",
  "budget_missing",
  "needs_reauth",
  "no_source",
  "snapshot_expired",
  "unsupported_location",
  "usage_reconciliation_required",
  "wallet_budget_exhausted",
]);

type MissingModule = { ok: true } | { ok: false; reason: string };

export function DomainOverviewMissingModule({
  blocked = false,
  failed = false,
  kind,
  loading = false,
  module,
  onLoad,
  onRefresh,
  paymentAction,
  paymentInput,
  refreshPrice,
  refreshing = false,
}: Readonly<{
  blocked?: boolean;
  failed?: boolean;
  kind: "keywords" | "pages";
  loading?: boolean;
  module?: MissingModule;
  onLoad?: () => void;
  onRefresh?: () => void;
  paymentAction?: (input: unknown) => Promise<unknown>;
  paymentInput?: Record<string, unknown> | null;
  refreshPrice?: ReactNode;
  refreshing?: boolean;
}>) {
  const t = useTranslations("projectDomainOverview.workspace.ui");
  const analyze = useTranslations("projectDomainOverview.workspace.analyze");
  const paymentT = useTranslations("shared.actionPayment");
  const cacheDuration = useDomainOverviewCacheDuration();
  const reason = module && !module.ok ? module.reason : undefined;
  const failureMessages = {
    operation_access_denied: t("moduleFailureReasons.operation_access_denied"),
    payment_admission: t("moduleFailureReasons.payment_admission"),
    cost_limit_exceeded: t("moduleFailureReasons.cost_limit_exceeded"),
    quote_changed: t("moduleFailureReasons.quote_changed"),
    provider_connection_changed: t("moduleFailureReasons.provider_connection_changed"),
    usage_persistence: t("moduleFailureReasons.usage_persistence"),
    rate_limited: t("moduleFailureReasons.rate_limited"),
    provider_error: t("moduleFailureReasons.provider_error"),
    unexpected: t("moduleFailureReasons.unexpected"),
  };
  const reasonKey =
    reason === "payment_quote_changed" || reason === "payment_quote_expired"
      ? "quote_changed"
      : reason === "credentials_changed"
        ? "provider_connection_changed"
        : reason?.startsWith("payment_")
          ? "payment_admission"
          : reason;
  const failureReason = failureMessages[reasonKey as keyof typeof failureMessages];
  const canLoad = Boolean(onLoad) && !(reason && UNLOADABLE_ROW_REASONS.has(reason));
  const keywords = kind === "keywords";
  const price = paymentAction ? (
    <ActionPaymentPrice
      action={paymentAction}
      cachedLabel={t("freeCached")}
      input={paymentInput ?? null}
    />
  ) : (
    paymentT("reviewPrice")
  );
  const action =
    canLoad && onLoad ? (
      <Button disabled={blocked} loading={loading} onClick={onLoad} size="sm" variant="secondary">
        {keywords ? t("loadKeywords") : t("loadPages")}
        {price}
      </Button>
    ) : onRefresh ? (
      <Button loading={refreshing} onClick={onRefresh} size="sm" variant="outline">
        {analyze("refresh")}
        {refreshPrice}
      </Button>
    ) : null;

  return (
    <DomainOverviewNoDataCard
      action={action}
      description={[
        failureReason,
        canLoad
          ? failed
            ? t(keywords ? "nextKeywordsFailed" : "nextPagesFailed")
            : t("rowsLoadHint", { duration: cacheDuration })
          : t(keywords ? "keywordRowsMissing" : "pageRowsMissing"),
      ]
        .filter(Boolean)
        .join(" ")}
      sectionTitle={t(keywords ? "topOrganicKeywords" : "topPages")}
      title={t(keywords ? "keywordRowsTitle" : "pageRowsTitle")}
    />
  );
}
