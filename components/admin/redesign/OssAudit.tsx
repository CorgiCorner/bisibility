"use client";
import { AdminAuditDataTable } from "@/components/admin/admin-audit-table-columns";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTranslations } from "next-intl";
import { useState } from "react";
export type PreviewAudit = {
  id: string;
  time: string;
  actor: string;
  action: string;
  target: string;
  result: "ok" | "failed" | "blocked";
  targetType?: string;
  category: "account" | "ops" | "setup";
};

export function OssAudit({
  entries,
  initialFilter = "all",
  isAdmin = true,
  error,
  nextCursor,
  onNext,
  onFirst,
  onFilterChange,
  onRetry,
}: {
  entries: PreviewAudit[];
  initialFilter?: string;
  isAdmin?: boolean;
  error?: string;
  nextCursor?: string;
  onNext: (cursor: string) => void;
  onFirst?: () => void;
  onFilterChange?: (filter: string) => void;
  onRetry?: () => void;
}) {
  const t = useTranslations("instanceAdmin");
  const [filter, setFilter] = useState(initialFilter);
  const rows = entries.filter((row) => filter === "all" || row.category === filter);
  if (!isAdmin) return <p role="status">{t("pages.noAdmin")}</p>;
  if (error)
    return (
      <div role="alert">
        <p>{error}</p>
        {onRetry && (
          <Button size="sm" onClick={onRetry}>
            {t("pages.retry")}
          </Button>
        )}
      </div>
    );
  return (
    <Card data-testid="oss-audit" component="section" size="lg" className="min-w-0">
      <h3 className="text-sm font-semibold">{t("pages.audit")}</h3>
      <div className="mt-3 flex gap-2 overflow-x-auto">
        {(["all", "account", "ops", "setup"] as const).map((value) => (
          <Button
            key={value}
            className="shrink-0"
            size="sm"
            variant="secondary"
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
              onFilterChange?.(value);
            }}
          >
            {t(`pages.auditFilters.${value}`)}
          </Button>
        ))}
      </div>
      {rows.length > 0 && (
        <div className="mt-3 min-w-0">
          <AdminAuditDataTable
            separateTargetType
            copyLabel={t("pages.copyTarget")}
            entries={rows.map((row) => ({
              id: row.id,
              createdAt: row.time,
              actorEmail: row.actor,
              action: row.action,
              targetId: row.target,
              targetType: row.targetType ?? "unknown",
              result: row.result,
            }))}
          />
        </div>
      )}
      {rows.length === 0 && <p className="mt-3 text-xs text-fg-muted">{t("pages.emptyAudit")}</p>}
      {onFirst && (
        <Button className="mt-3" size="sm" variant="secondary" onClick={onFirst}>
          {t("recovery.firstPage")}
        </Button>
      )}
      {nextCursor && (
        <Button className="mt-3" size="sm" variant="secondary" onClick={() => onNext(nextCursor)}>
          {t("pages.older")}
        </Button>
      )}
    </Card>
  );
}
