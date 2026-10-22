"use client";

import { dataLinkClassName } from "@/components/ui/data-link-styles";
import { type DeferralReasonCode, deferralReasonCode } from "@/lib/rank-check/deferral-reason";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import Link from "next/link";
import { useTranslations } from "next-intl";

type RankRunTranslator = ReturnType<typeof useTranslations<"projectRuns.rankRuns">>;

const DETAIL = {
  budget_exhausted: "deferral.budget_exhausted.detail",
  budget_missing: "deferral.budget_missing.detail",
  credentials_unavailable: "deferral.credentials_unavailable.detail",
  credits_exhausted: "deferral.credits_exhausted.detail",
  dispatcher_disabled: "deferral.dispatcher_disabled.detail",
  keyword_archived: "deferral.keyword_archived.detail",
  market_inactive: "deferral.market_inactive.detail",
  migration_hold: "deferral.migration_hold.detail",
  no_provider: "deferral.no_provider.detail",
  primary_provider_not_dataforseo: "deferral.primary_provider_not_dataforseo.detail",
  project_ineligible: "deferral.project_ineligible.detail",
  project_read_only: "deferral.project_read_only.detail",
  queued_dataforseo_disabled: "deferral.queued_dataforseo_disabled.detail",
  queued_submission_disabled: "deferral.queued_submission_disabled.detail",
  quote_unavailable: "deferral.quote_unavailable.detail",
  rate_limited: "deferral.rate_limited.detail",
  schedule_ineligible: "deferral.schedule_ineligible.detail",
  unknown: "deferral.unknown.detail",
  usage_unconfirmed: "deferral.usage_unconfirmed.detail",
} as const satisfies Record<DeferralReasonCode, Parameters<RankRunTranslator>[0]>;

const LABEL = {
  budget_exhausted: "deferral.budget_exhausted.label",
  budget_missing: "deferral.budget_missing.label",
  credentials_unavailable: "deferral.credentials_unavailable.label",
  credits_exhausted: "deferral.credits_exhausted.label",
  dispatcher_disabled: "deferral.dispatcher_disabled.label",
  keyword_archived: "deferral.keyword_archived.label",
  market_inactive: "deferral.market_inactive.label",
  migration_hold: "deferral.migration_hold.label",
  no_provider: "deferral.no_provider.label",
  primary_provider_not_dataforseo: "deferral.primary_provider_not_dataforseo.label",
  project_ineligible: "deferral.project_ineligible.label",
  project_read_only: "deferral.project_read_only.label",
  queued_dataforseo_disabled: "deferral.queued_dataforseo_disabled.label",
  queued_submission_disabled: "deferral.queued_submission_disabled.label",
  quote_unavailable: "deferral.quote_unavailable.label",
  rate_limited: "deferral.rate_limited.label",
  schedule_ineligible: "deferral.schedule_ineligible.label",
  unknown: "deferral.unknown.label",
  usage_unconfirmed: "deferral.usage_unconfirmed.label",
} as const satisfies Record<DeferralReasonCode, Parameters<RankRunTranslator>[0]>;

export function deferralDetail(code: DeferralReasonCode, t: RankRunTranslator) {
  return t(DETAIL[code]);
}

function deferralAction(code: DeferralReasonCode, projectRef: ProjectRef) {
  if (
    code === "credentials_unavailable" ||
    code === "no_provider" ||
    code === "primary_provider_not_dataforseo"
  ) {
    return {
      href: appPath(projectRef, "integrations"),
      labelKey: "deferral.openIntegrations" as const,
    };
  }
  if (code === "budget_exhausted" || code === "budget_missing" || code === "credits_exhausted") {
    return {
      href: appPath(projectRef, "settings", "usage"),
      labelKey: "deferral.reviewBudget" as const,
    };
  }
  return null;
}

export function DeferralReasonText({
  code,
  projectRef,
}: Readonly<{
  code: DeferralReasonCode;
  projectRef: ProjectRef;
}>) {
  const t = useTranslations("projectRuns.rankRuns");
  const action = deferralAction(code, projectRef);
  return (
    <span className="block text-end text-[11.5px] leading-[1.4]">
      <span className="block font-semibold text-fg">{t(LABEL[code])}</span>
      <span className="block text-fg-muted">{deferralDetail(code, t)}</span>
      {action ? (
        <Link className={dataLinkClassName} href={action.href}>
          {t(action.labelKey)}
        </Link>
      ) : null}
    </span>
  );
}

export function DeferralReasonLabel({ reason }: Readonly<{ reason: string }>) {
  const t = useTranslations("projectRuns.rankRuns");
  return <span className="block text-fg-muted">{t(LABEL[deferralReasonCode(reason)])}</span>;
}
