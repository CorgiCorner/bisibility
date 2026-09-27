"use client";

import { AdminAccountLookup } from "@/components/admin/AdminAccountLookup";
import { AdminAdministrationConsumptionTable } from "@/components/admin/admin-administration-tables";
import { MailTwoFactorGate } from "@/components/admin/MailTwoFactorGate";
import { Card } from "@/components/ui/Card";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { InstanceMailSettingsView } from "@/lib/email/instance-mail-runtime";
import type { InstanceAdminAdministration } from "@/lib/queries/instance-admin-administration";
import { appRootPath } from "@/lib/routing/app-path";
import { DOCS_URL } from "@/lib/site/site";
import { useFormatter, useTranslations } from "next-intl";

type GrowthMetric = InstanceAdminAdministration["growth"]["users"];

const growthCards = [
  { key: "users", messageKey: "users" },
  { key: "projects", messageKey: "projects" },
  { key: "keywords", messageKey: "keywords" },
  { key: "rankChecks", messageKey: "rankChecks" },
] as const satisfies readonly {
  key: keyof InstanceAdminAdministration["growth"];
  messageKey: "users" | "projects" | "keywords" | "rankChecks";
}[];

function sparklinePath(metric: GrowthMetric) {
  const values = metric.points.map((point) => point.count);
  const maximum = Math.max(1, ...values);
  const denominator = Math.max(1, values.length - 1);

  return values
    .map((value, index) => {
      const x = (index / denominator) * 100;
      const y = 29 - (value / maximum) * 25;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function deltaLabel(
  metric: GrowthMetric,
  t: ReturnType<typeof useTranslations<"instanceAdmin.administration.growth">>,
) {
  if (metric.deltaPercent === null) return t("noComparison");

  return t("delta", {
    direction:
      metric.deltaPercent > 0 ? "positive" : metric.deltaPercent < 0 ? "negative" : "other",
    value: Math.abs(metric.deltaPercent),
  });
}

function GrowthCard({
  label,
  metric,
}: Readonly<{
  label: string;
  metric: GrowthMetric;
}>) {
  const format = useFormatter();
  const t = useTranslations("instanceAdmin.administration.growth");

  return (
    <div className="flex min-w-0 flex-col rounded-card border border-border bg-bg-sunken px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.4px] text-fg-muted">{label}</div>
      <div className="mt-auto pt-1 text-xl font-semibold tabular-nums tracking-[-0.4px] text-fg">
        {format.number(metric.total)}
      </div>
      <svg
        aria-label={t("trend", { label })}
        className="mt-2 block h-[26px] w-full"
        preserveAspectRatio="none"
        role="img"
        viewBox="0 0 100 32"
      >
        <path
          d={sparklinePath(metric)}
          fill="none"
          stroke="var(--fg-muted)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-1.5 text-[10px] text-fg-muted">{deltaLabel(metric, t)}</div>
    </div>
  );
}

function Growth({ data }: Readonly<{ data: InstanceAdminAdministration }>) {
  const format = useFormatter();
  const t = useTranslations("instanceAdmin.administration.growth");

  return (
    <Card component="section" size="lg" aria-labelledby="admin-growth-heading">
      <SectionTitle id="admin-growth-heading">{t("title")}</SectionTitle>
      <p className="mt-1 text-xs text-fg-muted">{t("description")}</p>
      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
        {growthCards.map((card) => (
          <GrowthCard key={card.key} label={t(card.messageKey)} metric={data.growth[card.key]} />
        ))}
        <div className="flex min-w-0 flex-col rounded-card border border-border bg-bg-sunken px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-[0.4px] text-fg-muted">
            {t("activeAccounts")}
          </div>
          <div className="pt-1 text-xl font-semibold tabular-nums tracking-[-0.4px] text-fg">
            {format.number(data.activeAccountsApprox)}
          </div>
          <p className="mb-0 mt-auto pt-2 text-[10px] leading-relaxed text-fg-muted">
            {t("activeAccountsDescription")}
          </p>
        </div>
      </div>
    </Card>
  );
}

function TopConsumption({
  rows,
}: Readonly<{ rows: InstanceAdminAdministration["topConsumption"] }>) {
  const t = useTranslations("instanceAdmin.administration.consumption");
  const boundedRows = rows.slice(0, 10);

  return (
    <Card component="section" size="lg" aria-labelledby="admin-consumption-heading">
      <SectionTitle id="admin-consumption-heading">{t("title")}</SectionTitle>
      <p className="mt-1 text-xs text-fg-muted">{t("description")}</p>
      {boundedRows.length === 0 ? (
        <p className="mt-4 text-xs text-fg-muted">{t("empty")}</p>
      ) : (
        <div className="mt-3">
          <AdminAdministrationConsumptionTable rows={boundedRows} />
          <p className="mb-0 mt-2 text-[11px] leading-relaxed text-fg-muted">{t("note")}</p>
        </div>
      )}
    </Card>
  );
}

export function AdminAdministration({
  data,
  mailSettings = null,
  showMailerWarning = false,
}: Readonly<{
  data: InstanceAdminAdministration;
  mailSettings?: InstanceMailSettingsView | null;
  showMailerWarning?: boolean;
}>) {
  const t = useTranslations("instanceAdmin.administration.mailer");

  return (
    <div className="flex flex-col gap-4">
      {showMailerWarning ? (
        <Card component="section" size="lg" aria-labelledby="admin-mailer-warning-heading">
          <SectionTitle id="admin-mailer-warning-heading">{t("title")}</SectionTitle>
          <p className="mb-0 mt-2 text-xs leading-relaxed text-fg-muted">
            {mailSettings?.twoFactorEnabled
              ? t("descriptionReady")
              : t("description", { provider: "EMAIL_PROVIDER" })}
          </p>
          {mailSettings ? null : (
            <p className="mb-0 mt-2 text-xs leading-relaxed text-fg-muted">{t("locked")}</p>
          )}
          {mailSettings ? null : (
            <ExternalLink
              className="mt-3 text-xs font-semibold text-accent-text hover:underline"
              href={`${DOCS_URL}/self-hosting/email`}
            >
              {t("link")}
            </ExternalLink>
          )}
        </Card>
      ) : null}
      {mailSettings ? (
        <MailTwoFactorGate
          returnTo={appRootPath("admin", "administration")}
          settings={mailSettings}
        />
      ) : null}
      <Growth data={data} />
      <TopConsumption rows={data.topConsumption} />
      <AdminAccountLookup />
    </div>
  );
}
