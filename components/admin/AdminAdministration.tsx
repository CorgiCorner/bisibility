import { AdminAccountLookup } from "@/components/admin/AdminAccountLookup";
import { Card, IdChip, SectionTitle } from "@/components/ui";
import type { InstanceAdminAdministration } from "@/lib/queries/instance-admin-administration";

const count = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 4,
  minimumFractionDigits: 2,
  style: "currency",
});

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
    <div className="flex min-w-0 flex-col rounded-xl border border-border-soft bg-bg-sunken px-3 py-2.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.4px] text-fg-muted">{label}</div>
      <div className="mt-auto pt-1 text-xl font-semibold tracking-[-0.4px] text-fg">
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
      <div className="mt-1.5 font-mono text-[10px] text-fg-muted">{deltaLabel(metric)}</div>
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
        <div className="flex min-w-0 flex-col rounded-xl border border-border-soft bg-bg-sunken px-3 py-2.5">
          <div className="font-mono text-[10px] uppercase tracking-[0.4px] text-fg-muted">
            Active accounts (approx.)
          </div>
          <div className="pt-1 text-xl font-semibold tracking-[-0.4px] text-fg">
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
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[880px] table-fixed text-left">
            <caption className="sr-only">Top project and provider consumption this month</caption>
            <colgroup>
              <col className="w-[23%]" />
              <col className="w-[15%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[15%]" />
              <col className="w-[21%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.4px] text-fg-muted">
                <th className="px-0.5 pb-2 font-medium" scope="col">
                  Project ID
                </th>
                <th className="px-2 pb-2 font-medium" scope="col">
                  Provider
                </th>
                <th className="px-2 pb-2 font-medium" scope="col">
                  Checks
                </th>
                <th className="px-2 pb-2 font-medium" scope="col">
                  Requests / units
                </th>
                <th className="px-2 pb-2 font-medium" scope="col">
                  Reference cost
                </th>
                <th className="px-2 pb-2 font-medium" scope="col">
                  Share of instance
                </th>
              </tr>
            </thead>
            <tbody>
              {boundedRows.map((row) => {
                const share = Math.min(100, Math.max(0, row.sharePercent));
                return (
                  <tr className="border-b border-border-soft last:border-0" key={row.projectId}>
                    <td className="px-0.5 py-2">
                      <IdChip
                        className="max-w-full"
                        copyLabel={`Copy project ID ${row.projectId}`}
                        size="sm"
                        value={row.projectId}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <span className="block font-mono text-xs font-semibold">
                        {row.providerLabel}
                      </span>
                      <span className="mt-0.5 block font-mono text-[10px] text-fg-muted">
                        {row.rateBasis}
                      </span>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs font-semibold">
                      {count.format(row.checks)}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">
                      {count.format(row.billableUnits)}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">
                      {row.referenceCostKnown ? money.format(row.referenceCostCents / 100) : "-"}
                    </td>
                    <td className="px-2 py-2">
                      <span className="flex items-center gap-2">
                        <span
                          aria-label={`${row.sharePercent.toFixed(1)}% of instance reference cost`}
                          className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-bg-sunken"
                          role="img"
                        >
                          <span
                            className="block h-full rounded-full bg-accent"
                            style={{ width: `${share}%` }}
                          />
                        </span>
                        <span className="min-w-10 text-right font-mono text-[10.5px] text-fg-muted">
                          {row.sharePercent.toFixed(1)}%
                        </span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mb-0 mt-2 text-[11px] leading-relaxed text-fg-muted">
            Reference costs use maintained provider rates and recorded request units. Provider
            invoices remain authoritative.
          </p>
        </div>
      )}
    </Card>
  );
}

export function AdminAdministration({ data }: Readonly<{ data: InstanceAdminAdministration }>) {
  return (
    <div className="flex flex-col gap-4">
      <Growth data={data} />
      <TopConsumption rows={data.topConsumption} />
      <AdminAccountLookup />
    </div>
  );
}
