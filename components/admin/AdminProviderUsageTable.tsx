import type { InstanceAdminDashboard } from "@/lib/queries/instance-admin";

const count = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 4,
  minimumFractionDigits: 2,
  style: "currency",
});

export function AdminProviderUsageTable({
  usage,
}: Readonly<{ usage: InstanceAdminDashboard["stats"]["providerUsage"] }>) {
  if (usage.length === 0) {
    return <p className="mt-4 text-xs text-fg-muted">No completed SERP checks this month.</p>;
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-xs">
        <caption className="sr-only">SERP usage this month by provider</caption>
        <thead className="border-b border-border text-fg-muted">
          <tr>
            <th className="pb-2 pr-3">Provider</th>
            <th className="pb-2 pr-3">Completed checks</th>
            <th className="pb-2 pr-3">Requests / units</th>
            <th className="pb-2 pr-3">Reference cost</th>
            <th className="pb-2">Rate basis</th>
          </tr>
        </thead>
        <tbody>
          {usage.map((row) => (
            <tr className="border-b border-border-soft last:border-0" key={row.provider}>
              <td className="py-2 pr-3 font-semibold text-fg">{row.providerLabel}</td>
              <td className="py-2 pr-3 font-mono">{count.format(row.checks)}</td>
              <td className="py-2 pr-3 font-mono">{count.format(row.billableUnits)}</td>
              <td className="py-2 pr-3 font-mono">
                {row.referenceCostKnown ? money.format(row.referenceCostCents / 100) : "-"}
              </td>
              <td className="py-2 font-mono text-[11px] text-fg-muted">{row.rateBasis}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mb-0 mt-2 text-[11px] leading-relaxed text-fg-muted">
        Reference estimates use maintained provider rates and recorded request units. User-entered
        costs are ignored; provider invoices remain authoritative.
      </p>
    </div>
  );
}
