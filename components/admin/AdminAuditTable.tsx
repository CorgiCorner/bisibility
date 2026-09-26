"use client";

import { AdminAuditDataTable } from "@/components/admin/admin-audit-table-columns";
import { Card } from "@/components/ui/Card";
import { filterChipStateClassName } from "@/components/ui/filter-chip-styles";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type {
  InstanceAdminAuditFilter,
  InstanceAdminAuditPage,
} from "@/lib/queries/instance-admin-audit";
import { appRootPath } from "@/lib/routing/app-path";
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import Link from "next/link";
import { useTranslations } from "next-intl";

const filters = [
  "all",
  "account",
  "ops",
  "setup",
] as const satisfies readonly InstanceAdminAuditFilter[];

function auditHref(filter: InstanceAdminAuditFilter, cursor?: string | null) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (cursor) params.set("cursor", cursor);

  const query = params.toString();
  const path = appRootPath("admin", "audit");
  return query ? `${path}?${query}` : path;
}

export function AdminAuditTable({ entries, filter, nextCursor }: Readonly<InstanceAdminAuditPage>) {
  const t = useTranslations("instanceAdmin.audit");
  const controls = useTranslations("instanceAdmin.controls");

  return (
    <Card component="section" size="lg" aria-labelledby="admin-activity-heading">
      <SectionTitle id="admin-activity-heading">{t("title")}</SectionTitle>
      <p className="mt-1 text-xs text-fg-muted">{t("description")}</p>
      <div className="mt-3">
        <nav aria-label={t("filterLabel")} className="flex flex-wrap gap-2">
          {filters.map((filterKey) => {
            const active = filterKey === filter;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-7 items-center rounded-full border px-3 text-[11.5px] font-semibold outline-none transition-colors ${filterChipStateClassName(
                  active,
                )}`}
                href={auditHref(filterKey)}
                key={filterKey}
                prefetch={false}
              >
                {t(filterKey)}
                {active ? <span className="sr-only"> {t("selected")}</span> : null}
              </Link>
            );
          })}
        </nav>

        {entries.length === 0 ? (
          <p className="mt-4 text-xs text-fg-muted">{t("empty")}</p>
        ) : (
          <div className="mt-3">
            <AdminAuditDataTable entries={entries} />
          </div>
        )}

        {nextCursor ? (
          <Link
            className="mt-3 inline-flex min-h-[34px] items-center gap-2 rounded-control border border-border-control bg-bg-elev px-3.5 text-xs font-semibold text-fg-muted outline-none transition-colors hover:border-accent hover:text-fg focus-visible:border-accent focus-visible:text-fg"
            href={auditHref(filter, nextCursor)}
            prefetch={false}
          >
            <ClockCounterClockwise aria-hidden size={14} weight="regular" />
            {controls("olderEntries")}
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
