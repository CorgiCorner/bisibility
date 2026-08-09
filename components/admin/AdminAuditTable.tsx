import { displayTime } from "@/components/admin/AdminPrimitives";
import { Card, CopyButton, filterChipStateClassName, SectionTitle } from "@/components/ui";
import type {
  InstanceAdminAuditFilter,
  InstanceAdminAuditPage,
} from "@/lib/queries/instance-admin-audit";
import { appRootPath } from "@/lib/routing/app-path";
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

type AuditEntry = InstanceAdminAuditPage["entries"][number];

const filters = [
  { key: "all", label: "All" },
  { key: "account", label: "Account" },
  { key: "ops", label: "Ops" },
  { key: "setup", label: "Setup" },
] as const satisfies readonly { key: InstanceAdminAuditFilter; label: string }[];

const resultClasses = {
  blocked: "bg-yellow/10 text-yellow-text",
  failed: "bg-red/10 text-red-text",
  ok: "bg-green/10 text-green-text",
} satisfies Record<AuditEntry["result"], string>;

function auditHref(filter: InstanceAdminAuditFilter, cursor?: string | null) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (cursor) params.set("cursor", cursor);

  const query = params.toString();
  const path = appRootPath("admin", "audit");
  return query ? `${path}?${query}` : path;
}

function AuditResult({ result }: Readonly<{ result: AuditEntry["result"] }>) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase ${resultClasses[result]}`}
    >
      {result}
    </span>
  );
}

export function AdminAuditTable({ entries, filter, nextCursor }: Readonly<InstanceAdminAuditPage>) {
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
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed text-left">
              <caption className="sr-only">Instance administrator activity</caption>
              <colgroup>
                <col className="w-[16%]" />
                <col className="w-[20%]" />
                <col className="w-[22%]" />
                <col className="w-[30%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border font-mono text-[10px] uppercase tracking-[0.4px] text-fg-muted">
                  <th className="px-0.5 pb-2 font-medium" scope="col">
                    Time
                  </th>
                  <th className="px-2 pb-2 font-medium" scope="col">
                    Actor
                  </th>
                  <th className="px-2 pb-2 font-medium" scope="col">
                    Action
                  </th>
                  <th className="px-2 pb-2 font-medium" scope="col">
                    Target
                  </th>
                  <th className="px-2 pb-2 font-medium" scope="col">
                    Result
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const target = entry.targetId
                    ? `${entry.targetType}:${entry.targetId}`
                    : `${entry.targetType}:unavailable`;
                  return (
                    <tr className="border-b border-border-soft last:border-0" key={entry.id}>
                      <td className="whitespace-nowrap px-0.5 py-2.5 text-[11.5px] text-fg-muted">
                        {displayTime(entry.createdAt)}
                      </td>
                      <td
                        className="truncate px-2 py-2.5 font-mono text-[11px]"
                        title={entry.actorEmail ?? undefined}
                      >
                        {entry.actorEmail ?? "-"}
                      </td>
                      <td
                        className="truncate px-2 py-2.5 font-mono text-[11.5px] font-semibold"
                        title={entry.action}
                      >
                        {entry.action}
                      </td>
                      <td className="px-2 py-2.5">
                        <span className="flex min-w-0 items-center gap-1">
                          <span
                            className="min-w-0 truncate font-mono text-[11px] text-fg-muted"
                            title={target}
                          >
                            {target}
                          </span>
                          {entry.targetId ? (
                            <CopyButton
                              className="shrink-0"
                              label={`Copy audit target ${target}`}
                              size="sm"
                              text={target}
                            />
                          ) : null}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        <AuditResult result={entry.result} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {nextCursor ? (
          <Link
            className="mt-3 inline-flex min-h-[34px] items-center gap-2 rounded-[9px] border border-border-strong bg-bg-elev px-3.5 text-xs font-semibold text-fg-muted outline-none transition-colors hover:border-accent hover:text-fg focus-visible:border-accent focus-visible:text-fg"
            href={auditHref(filter, nextCursor)}
            prefetch={false}
          >
            <ClockCounterClockwise aria-hidden size={14} />
            Older entries
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
