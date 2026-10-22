"use client";
import { BudgetRemaining } from "@/components/metering/BudgetRemaining";
import {
  BudgetHeading,
  BudgetValue,
  type BudgetValueKind,
} from "@/components/metering/BudgetValue";
import { useUsagePresentation } from "@/components/metering/use-usage-presentation";
import { IdChip } from "@/components/ui/IdChip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/usagekit/primitives/table";
import { UsageStatus } from "@/components/usagekit/usage-motion";
import type { MeteringAdminData } from "@/lib/metering/admin-types";
import { useTranslations } from "next-intl";

export function AdminBudgetTable({
  rows,
  references,
  busy,
}: {
  rows: MeteringAdminData["budgets"];
  busy?: boolean;
  references?: MeteringAdminData["references"];
}) {
  const p = useUsagePresentation();
  const t = useTranslations("instanceAdmin.metering");
  return (
    <div className="min-w-0 overflow-hidden rounded-card border border-border">
      <Table
        aria-label={t("budgetsHeading")}
        tabIndex={0}
        aria-busy={busy || undefined}
        className="min-w-[64rem] table-fixed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-solid"
      >
        <TableHeader className="bg-bg-sunken">
          <TableRow>
            <TableHead className="px-4 text-xs">{t("scope")}</TableHead>
            {(["used", "reserved", "remaining", "limit"] as BudgetValueKind[]).map((kind) => (
              <TableHead
                key={kind}
                aria-label={p.budget[kind]}
                className="w-32 px-4 text-right text-xs"
              >
                <BudgetHeading kind={kind} />
              </TableHead>
            ))}
            <TableHead className="px-4 text-xs">{t("status")}</TableHead>
            <TableHead className="px-4 text-xs">{p.budget.resets}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => {
              const ref = references?.connections[row.target];
              const name = references?.projects[row.target] ?? ref?.project;
              const tone =
                row.level === "ok"
                  ? "positive"
                  : row.level === "warning"
                    ? "warning"
                    : row.level === "exceeded"
                      ? "exceeded"
                      : "unknown";
              return (
                <TableRow key={row.id}>
                  <TableCell className="min-w-60 max-w-80 whitespace-normal break-words px-4 py-3">
                    <div className="font-medium">
                      {name ?? (row.kind === "group" ? t("project") : p.dimensions.connection)}
                    </div>
                    {row.redacted && (
                      <p className="mt-1 text-xs text-fg-muted">{p.budget.redacted}</p>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-xs text-fg-muted">
                      {ref?.provider && <span>{ref.provider}</span>}
                      <IdChip value={row.target} truncate="middle" size="xs" />
                    </div>
                    <p className="mt-1 text-xs text-fg-muted">
                      {p
                        .bound({ ...row, target: "project", kind: "group" })
                        .split(" · ")
                        .slice(1)
                        .join(" · ")}
                    </p>
                  </TableCell>
                  {(["used", "reserved", "remaining", "limit"] as BudgetValueKind[]).map(
                    (kind, i) => (
                      <TableCell key={i} className="px-4 py-3 text-right tabular-nums">
                        {row.redacted ? (
                          p.budget.unavailable
                        ) : (
                          <BudgetValue
                            value={row.level === "unavailable" ? "unavailable" : row[kind]}
                            kind={kind}
                            level={row.level}
                            monthly={row.window === "calendar_month"}
                          />
                        )}
                        {kind === "remaining" && <BudgetRemaining row={row} />}
                        {i === 3 &&
                          row.boundary.onExceed === "allow" &&
                          row.boundary.hardLimit &&
                          !row.redacted && (
                            <p className="mt-1 text-xs text-fg-muted">
                              {p.budget.hardLimit}:{" "}
                              <BudgetValue kind="limit" value={row.boundary.hardLimit} />
                            </p>
                          )}
                      </TableCell>
                    ),
                  )}
                  <TableCell className="px-4 py-3">
                    <UsageStatus tone={tone}>
                      {row.level === "unavailable" ? p.budget.unavailable : p.budget[row.level]}
                    </UsageStatus>
                    <p className="mt-1 text-xs text-fg-muted">
                      {row.boundary.onExceed === "block" ? p.budget.block : p.budget.allow}
                    </p>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-xs text-fg-muted tabular-nums">
                    {row.resetsAt ? (
                      <time dateTime={row.resetsAt}>{p.date(row.resetsAt)}</time>
                    ) : (
                      p.budget.noReset
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={7} className="px-4 py-8 text-center text-fg-muted">
                {p.budget.empty}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
