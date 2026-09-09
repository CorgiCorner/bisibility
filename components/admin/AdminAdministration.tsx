import { AdminAccountLookup } from "@/components/admin/AdminAccountLookup";
import { AdminAdministrationConsumptionTable } from "@/components/admin/admin-administration-tables";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { InstanceAdminAdministration } from "@/lib/queries/instance-admin-administration";
import { DOCS_URL, docsLinkProps } from "@/lib/site/site";

const count = new Intl.NumberFormat("en-US");
type GrowthMetric = InstanceAdminAdministration["growth"]["users"];

const growthCards = [
  { key: "users", label: "Users" },
  { key: "projects", label: "Projects" },
  { key: "keywords", label: "Keywords" },
  { key: "rankChecks", label: "Rank checks" },
] as const satisfies readonly {
  key: keyof InstanceAdminAdministration["growth"];
  label: string;
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

function deltaLabel(metric: GrowthMetric) {
  if (metric.deltaPercent === null) return "No prior-period comparison";
  const prefix = metric.deltaPercent > 0 ? "+" : "";
  return `${prefix}${metric.deltaPercent.toFixed(1)}% vs prior 30 days`;
}

function GrowthCard({ label, metric }: Readonly<{ label: string; metric: GrowthMetric }>) {
  return (
    <div className="flex min-w-0 flex-col rounded-card border border-border bg-bg-sunken px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.4px] text-fg-muted">{label}</div>
      <div className="mt-auto pt-1 text-xl font-semibold tabular-nums tracking-[-0.4px] text-fg">
        {count.format(metric.total)}
      </div>
      <svg
        aria-label={`${label} daily count trend`}
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
      <div className="mt-1.5 text-[10px] text-fg-muted">{deltaLabel(metric)}</div>
    </div>
  );
}

function Growth({ data }: Readonly<{ data: InstanceAdminAdministration }>) {
  return (
    <Card component="section" size="lg" aria-labelledby="admin-growth-heading">
      <SectionTitle id="admin-growth-heading">Growth</SectionTitle>
      <p className="mt-1 text-xs text-fg-muted">
        30-day UTC aggregates. No behavioral analytics or tenant content.
      </p>
      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
        {growthCards.map((card) => (
          <GrowthCard key={card.key} label={card.label} metric={data.growth[card.key]} />
        ))}
        <div className="flex min-w-0 flex-col rounded-card border border-border bg-bg-sunken px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-[0.4px] text-fg-muted">
            Active accounts (approx.)
          </div>
          <div className="pt-1 text-xl font-semibold tabular-nums tracking-[-0.4px] text-fg">
            {count.format(data.activeAccountsApprox)}
          </div>
          <p className="mb-0 mt-auto pt-2 text-[10px] leading-relaxed text-fg-muted">
            Distinct accounts with session activity in the last 7 days.
          </p>
        </div>
      </div>
    </Card>
  );
}

function TopConsumption({
  rows,
}: Readonly<{ rows: InstanceAdminAdministration["topConsumption"] }>) {
  const boundedRows = rows.slice(0, 10);

  return (
    <Card component="section" size="lg" aria-labelledby="admin-consumption-heading">
      <SectionTitle id="admin-consumption-heading">Top consumption</SectionTitle>
      <p className="mt-1 text-xs text-fg-muted">
        Top 10 project/provider rows by reference cost this month. User-entered rates are ignored.
      </p>
      {boundedRows.length === 0 ? (
        <p className="mt-4 text-xs text-fg-muted">No completed SERP checks recorded this month.</p>
      ) : (
        <div className="mt-3">
          <div className="[&>[role=table]]:border-0">
            <AdminAdministrationConsumptionTable rows={boundedRows} />
          </div>
          <p className="mb-0 mt-2 text-[11px] leading-relaxed text-fg-muted">
            Reference costs use maintained provider rates and recorded request units. Provider
            invoices remain authoritative.
          </p>
        </div>
      )}
    </Card>
  );
}

export function AdminAdministration({
  data,
  showMailerWarning = false,
}: Readonly<{ data: InstanceAdminAdministration; showMailerWarning?: boolean }>) {
  return (
    <div className="flex flex-col gap-4">
      {showMailerWarning ? (
        <Card component="section" size="lg" aria-labelledby="admin-mailer-warning-heading">
          <SectionTitle id="admin-mailer-warning-heading">
            Email provider not configured
          </SectionTitle>
          <p className="mt-2 mb-0 text-xs leading-relaxed text-fg-muted">
            Email sign-in is unavailable because this instance cannot send sign-in codes. Set
            EMAIL_PROVIDER and its required credentials to restore email delivery.
          </p>
          <a
            className="mt-3 inline-flex text-xs font-semibold text-accent-text hover:underline"
            {...docsLinkProps(`${DOCS_URL}/self-hosting/email`)}
          >
            Configure email delivery
          </a>
        </Card>
      ) : null}
      <Growth data={data} />
      <TopConsumption rows={data.topConsumption} />
      <AdminAccountLookup />
    </div>
  );
}
