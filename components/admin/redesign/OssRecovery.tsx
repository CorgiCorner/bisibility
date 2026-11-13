"use client";

import { AdminTableState } from "@/components/admin/AdminTableState";
import { RecoveryPartialEvidence } from "@/components/admin/recovery/RecoveryPartialEvidence";
import { RecoverySummary } from "@/components/admin/recovery/RecoverySummary";
import { RecoveryTable } from "@/components/admin/recovery/RecoveryTable";
import { useRecoveryBatchSelection } from "@/components/admin/recovery/useRecoverySelection";
import { Button } from "@/components/ui/Button";
import { MenuSelect } from "@/components/ui/MenuSelect";
import type {
  RecoveryCase,
  RecoveryCommandResult,
  RecoveryPage,
  RecoveryPreview,
} from "@/lib/metering/recovery/contract";
import { useTranslations } from "next-intl";
import { useCallback, useContext, useState } from "react";
import { OssRecoveryBatchDialog } from "./OssRecoveryBatchDialog";
import { OssRecoveryDetails, type RecoveryTriage } from "./OssRecoveryDetails";

const triageFor = (row: RecoveryCase | null): RecoveryTriage => ({
  status: row?.triage.status ?? "open",
  reason: row?.triage.reason ?? "none",
  due: "24",
  snoozedUntil: row?.triage.snoozedUntil ?? null,
  assign: row?.triage.assignedToMe ?? false,
});
export function OssRecovery({
  page,
  initialCategory = "all",
  initialProvider = "all",
  hasPrevious = false,
  live = false,
  preview,
  command,
  busy = false,
  isAdmin = true,
  twoFactorEnabled = true,
  error,
  commandError,
  triageError,
  triageNotice,
  batchError,
  initialDialogOpen = false,
  initialDetail = null,
  now,
  onRefresh,
  onPreview,
  onConfirm,
  onSaveTriage,
  onRetryCommand,
  onPage,
  onFilterChange,
}: {
  page: RecoveryPage | null;
  initialCategory?: string;
  initialProvider?: string;
  hasPrevious?: boolean;
  live?: boolean;
  preview?: RecoveryPreview | null;
  command?: RecoveryCommandResult | null;
  busy?: boolean;
  isAdmin?: boolean;
  twoFactorEnabled?: boolean;
  error?: string;
  commandError?: string;
  triageError?: string;
  triageNotice?: string;
  batchError?: string;
  initialDialogOpen?: boolean;
  initialDetail?: RecoveryCase | null;
  now?: number;
  onRefresh: () => void;
  onPreview: (references: string[]) => void;
  onConfirm: (preview: RecoveryPreview) => boolean | undefined | Promise<boolean | undefined>;
  onSaveTriage: (row: RecoveryCase, triage: RecoveryTriage) => void;
  onRetryCommand: () => void;
  onPage: (cursor: string | undefined, filters: { category: string; provider: string }) => void;
  onFilterChange: (filters: { category: string; provider: string }) => void;
}) {
  const t = useTranslations("instanceAdmin.recovery");
  const p = useTranslations("instanceAdmin.pages");
  const [category, setCategory] = useState(initialCategory);
  const [provider, setProvider] = useState(initialProvider);
  const selection = useRecoveryBatchSelection(page?.rows ?? []);
  const { selected } = selection;
  const [selectedDetail, setDetail] = useState<RecoveryCase | null>(initialDetail);
  const route = useContext(AdminTableState);
  const detail = live
    ? (page?.rows.find(
        (row) => row.reference === (route ? route.get("case") : selectedDetail?.reference),
      ) ?? null)
    : selectedDetail;
  const [dialog, setDialog] = useState(initialDialogOpen);
  const [older, setOlder] = useState(hasPrevious);
  const [triage, setTriage] = useState<RecoveryTriage>(() => triageFor(detail));
  // Stable, like the selection callback, so a checkbox does not rebuild the table columns.
  const openDetails = useCallback(
    (row: RecoveryCase) => {
      setDetail(row);
      route?.update({ case: row.reference });
      setTriage(triageFor(row));
    },
    [route],
  );
  if (!isAdmin) return <p role="status">{p("noAdmin")}</p>;
  if (!page)
    return (
      <section data-testid="oss-tasks">
        <p role="status">{t("unavailable")}</p>
        <Button disabled={busy} onClick={onRefresh}>
          {p("retry")}
        </Button>
      </section>
    );
  const rows = page.rows.filter(
    (row) =>
      (provider === "all" || row.provider === provider) &&
      (category === "all" ||
        (category === "unfinished" && row.work === "unfinished") ||
        (category === "accounting" && row.accounting === "unknown") ||
        (category === "failed" && !!row.failure) ||
        (category === "historical" && row.historical) ||
        (category === "closed_unknown" && row.closedUnknown)),
  );
  return (
    <section
      data-testid="oss-tasks"
      className="grid min-w-0 gap-5"
      aria-label={p("console")}
      aria-busy={busy}
    >
      {busy && <p role="status">{p("loadingCases")}</p>}
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{p("console")}</h3>
          <p className="mt-1 text-xs text-fg-muted">
            {p("instance")}: {page.instance} · {p("namespace")}: {page.namespace}
          </p>
          {!live && (
            <p className="mt-1 text-xs text-fg-muted">Sample data - no live instance connected.</p>
          )}
        </div>
        <Button variant="secondary" disabled={busy} onClick={onRefresh}>
          {p("refreshCases")}
        </Button>
      </div>
      <RecoverySummary page={page} taskOnly />
      <p className="text-xs text-fg-muted">
        {t("taskOnly.noSpend")} {t("safetyNote")}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <MenuSelect
          ariaLabel={p("category")}
          value={category}
          onChange={(value) => {
            setCategory(value);
            selection.clear();
            setOlder(false);
            onFilterChange({ category: value, provider });
          }}
          options={(
            ["all", "unfinished", "accounting", "failed", "historical", "closed_unknown"] as const
          ).map((value) => ({ value, label: p(`categories.${value}`) }))}
        />
        <MenuSelect
          ariaLabel={t("provider")}
          value={provider}
          onChange={(value) => {
            setProvider(value);
            selection.clear();
            setOlder(false);
            onFilterChange({ category, provider: value });
          }}
          options={["all", ...new Set(page.rows.map((row) => row.provider))].map((value) => ({
            value,
            label: value === "all" ? t("allProviders") : value,
          }))}
        />
        <Button
          disabled={busy || !selected.length}
          onClick={() => {
            onPreview(selected);
            setDialog(true);
          }}
        >
          {t("previewSelected", { count: selected.length })}
        </Button>
        <span className="text-xs text-fg-muted">{t("batchLimit", { count: 25 })}</span>
      </div>
      {error && <p role="alert">{error}</p>}
      {triageNotice && <p role="status">{triageNotice}</p>}
      {commandError && (
        <div role="status">
          {commandError}{" "}
          <Button variant="secondary" onClick={onRetryCommand}>
            {p("retryCommand")}
          </Button>
        </div>
      )}
      {command && (
        <div role="status" className="rounded-card border border-border p-4 text-sm">
          <p>{p("command", { state: p(`commandStatuses.${command.state}`) })}</p>
          <p className="mt-1 text-fg-muted">
            {(["queued", "unchanged", "recovered", "failed", "skipped"] as const)
              .map(
                (status) =>
                  `${p(`commandOutcomes.${status}`)}: ${command.outcomes.filter((item) => item.status === status).length}`,
              )
              .join(" · ")}
          </p>
          {!["completed", "failed"].includes(command.state) && (
            <Button variant="secondary" disabled={busy} onClick={onRetryCommand}>
              {t("refresh")}
            </Button>
          )}
          {["completed", "failed"].includes(command.state) && (
            <Button variant="secondary" onClick={onRefresh}>
              {p("refreshCases")}
            </Button>
          )}
        </div>
      )}
      <div className="min-w-0 [&_.text-warning]:text-fg-muted">
        <RecoveryTable
          rows={rows}
          showAccounting={false}
          selected={selected}
          busy={busy}
          onDetails={openDetails}
          onSelect={selection.select}
        />
      </div>
      <RecoveryPartialEvidence rows={page.partialEvidence ?? []} />
      <div className="flex gap-3">
        {older && (
          <Button
            variant="secondary"
            onClick={() => {
              setOlder(false);
              onPage(undefined, { category, provider });
            }}
          >
            {t("firstPage")}
          </Button>
        )}
        {page.nextCursor && (
          <Button
            variant="secondary"
            onClick={() => {
              setOlder(true);
              onPage(page.nextCursor ?? undefined, { category, provider });
            }}
          >
            {t("nextPage")}
          </Button>
        )}
      </div>
      <OssRecoveryDetails
        detail={detail}
        triage={triage}
        setTriage={setTriage}
        busy={busy}
        triageError={triageError}
        triageNotice={triageNotice}
        onClose={() => {
          setDetail(null);
          route?.update({ case: undefined });
        }}
        onSaveTriage={onSaveTriage}
      />
      <OssRecoveryBatchDialog
        open={route ? !!route.get("batch") : dialog}
        preview={preview}
        busy={busy}
        twoFactorEnabled={twoFactorEnabled}
        now={now}
        error={batchError}
        onClose={() => {
          setDialog(false);
          route?.update({ batch: undefined });
        }}
        onConfirm={onConfirm}
      />
    </section>
  );
}
