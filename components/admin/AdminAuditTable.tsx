import { AdminAuditDataTable } from "@/components/admin/admin-audit-table-columns";
import { Card } from "@/components/ui/Card";
import { filterChipStateClassName } from "@/components/ui/filter-chip-styles";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { DateFormat } from "@/lib/dates/format";
import type {
  InstanceAdminAuditFilter,
  InstanceAdminAuditPage,
} from "@/lib/queries/instance-admin-audit";
import { appRootPath } from "@/lib/routing/app-path";
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr/ClockCounterClockwise";
import Link from "next/link";

const filters = [
  { key: "all", label: "All" },
  { key: "account", label: "Account" },
  { key: "ops", label: "Ops" },
  { key: "setup", label: "Setup" },
] as const satisfies readonly { key: InstanceAdminAuditFilter; label: string }[];

function auditHref(filter: InstanceAdminAuditFilter, cursor?: string | null) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (cursor) params.set("cursor", cursor);

  const query = params.toString();
  const path = appRootPath("admin", "audit");
  return query ? `${path}?${query}` : path;
}

export function AdminAuditTable({
  dateFormat = "day_first",
  entries,
  filter,
  nextCursor,
}: Readonly<InstanceAdminAuditPage & { dateFormat?: DateFormat }>) {
  return (
    <Card component="section" size="lg" aria-labelledby="admin-activity-heading">
      <SectionTitle id="admin-activity-heading">Admin activity</SectionTitle>
      <p className="mt-1 text-xs text-fg-muted">
        instance_admin.* entries. Visible to instance admins only; admins are not anonymous to each
        other.
      </p>
      <div className="mt-3">
        <nav aria-label="Filter instance administrator activity" className="flex flex-wrap gap-2">
          {filters.map((option) => {
            const active = option.key === filter;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-7 items-center rounded-full border px-3 text-[11.5px] font-semibold outline-none transition-colors ${filterChipStateClassName(
                  active,
                )}`}
                href={auditHref(option.key)}
                key={option.key}
                prefetch={false}
              >
                {option.label}
                {active ? <span className="sr-only"> selected</span> : null}
              </Link>
            );
          })}
        </nav>

        {entries.length === 0 ? (
          <p className="mt-4 text-xs text-fg-muted">
            No instance-admin audit entries match this filter.
          </p>
        ) : (
          <div className="mt-3 [&>[role=table]]:border-0">
            <AdminAuditDataTable dateFormat={dateFormat} entries={entries} />
          </div>
        )}

        {nextCursor ? (
          <Link
            className="mt-3 inline-flex min-h-[34px] items-center gap-2 rounded-control border border-border-control bg-bg-elev px-3.5 text-xs font-semibold text-fg-muted outline-none transition-colors hover:border-accent hover:text-fg focus-visible:border-accent focus-visible:text-fg"
            href={auditHref(filter, nextCursor)}
            prefetch={false}
          >
            <ClockCounterClockwise aria-hidden size={14} weight="regular" />
            Older entries
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
