"use client";
import { AdminTableState } from "@/components/admin/AdminTableState";
import { useRecoveryBatch } from "@/components/admin/pages/useRecoveryBatch";
import { Button } from "@/components/ui/Button";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { loadRecoveryPageAction } from "@/lib/actions/metering-recovery";
import type {
  RecoveryFilters,
  RecoveryPage,
  RecoveryUiError,
} from "@/lib/metering/recovery/contract";
import { MAX_RECOVERY_BATCH } from "@/lib/metering/recovery/input";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useContext, useState, useTransition } from "react";
import { RecoveryDetails } from "./RecoveryDetails";
import { RecoveryLoadFallback } from "./RecoveryLoadFallback";
import { RecoveryPartialEvidence } from "./RecoveryPartialEvidence";
import { RecoveryPreviewDialog } from "./RecoveryPreviewDialog";
import { RecoverySummary } from "./RecoverySummary";
import { RecoveryTable } from "./RecoveryTable";
import {
  type RecoveryConsoleProps,
  useRecoveryBatchSelection,
  useRecoverySelection,
} from "./useRecoverySelection";

export function AdminRecoveryConsole({ initial, filters, onNavigate }: RecoveryConsoleProps) {
  const [client] = useState(() => new QueryClient());
  const [loaded, setLoaded] = useState(initial);
  const [loading, startLoad] = useTransition();
  const available = initial ?? loaded;
  return (
    <QueryClientProvider client={client}>
      {available ? (
        <RecoveryConsole initial={available} initialFilters={filters} onNavigate={onNavigate} />
      ) : (
        <RecoveryLoadFallback
          loading={loading}
          onLoad={() =>
            startLoad(async () => {
              const result = await loadRecoveryPageAction({});
              if (result.ok) setLoaded(result.value);
            })
          }
        />
      )}
    </QueryClientProvider>
  );
}
function RecoveryConsole({
  initial,
  initialFilters,
  onNavigate,
}: {
  initial: RecoveryPage;
  initialFilters?: RecoveryFilters;
  onNavigate?: RecoveryConsoleProps["onNavigate"];
}) {
  const t = useTranslations("instanceAdmin.recovery"),
    [busy, start] = useTransition();
  const [localPage, setPage] = useState(initial),
    [localFilters, setFilters] = useState<RecoveryFilters>(initialFilters ?? { category: "all" });
  const page = onNavigate ? initial : localPage;
  const filters = onNavigate ? (initialFilters ?? { category: "all" }) : localFilters;
  const selection = useRecoveryBatchSelection(page.rows);
  const { selected } = selection;
  const [detail, setDetail] = useRecoverySelection(page.rows);
  const route = useContext(AdminTableState);
  const batch = useRecoveryBatch(
    route
      ? {
          batch: route.get("batch"),
          command: route.get("command"),
          update: route.update,
        }
      : undefined,
    page.rows,
  );
  const { preview, command } = batch;
  const [error, setError] = useState<RecoveryUiError | null>(null);
  function load(next: RecoveryFilters = filters) {
    if (onNavigate) {
      onNavigate(next);
      return;
    }
    start(async () => {
      const result = await loadRecoveryPageAction(next);
      if (result.ok) {
        setPage(result.value);
        setFilters(next);
        selection.clear();
        setDetail(null);
        setError(null);
      } else setError(result.code);
    });
  }
  function plan() {
    batch.onPreview(selected);
  }
  function commit() {
    if (!preview) return;
    start(async () => {
      if (await batch.onConfirm(preview)) selection.clear();
    });
  }
  const activeError = batch.batchErrorCode ?? error;
  return (
    <section className="grid min-w-0 gap-5" aria-label={t("heading")}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">{t("heading")}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-fg-muted">{t("description")}</p>
          <p className="mt-2 break-all text-xs text-fg-muted">
            {page.instance} · {t("namespace")}: {page.namespace}
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => load({ ...filters, cursor: undefined })}
        >
          <ArrowClockwiseIcon weight="regular" aria-hidden />
          {t("refresh")}
        </Button>
      </div>
      <RecoverySummary page={page} />
      <div className="flex items-center gap-1 text-xs text-fg-muted">
        <span>{t("noSpendShort")}</span>
        <InfoTooltip text={t("safetyNote")} />
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-bg-elev p-4">
        <div className="grid min-w-40 gap-1.5">
          <span className="text-xs font-medium text-fg-muted">{t("category")}</span>
          <MenuSelect
            ariaLabel={t("category")}
            disabled={busy}
            value={filters.category ?? "all"}
            options={(
              ["all", "unfinished", "accounting", "failed", "historical", "closed_unknown"] as const
            ).map((value) => ({ value, label: t(`categories.${value}`) }))}
            onChange={(value) =>
              load({
                category: value as RecoveryFilters["category"],
                provider: filters.provider,
              })
            }
          />
        </div>
        <div className="grid min-w-40 gap-1.5">
          <span className="text-xs font-medium text-fg-muted">{t("provider")}</span>
          <MenuSelect
            ariaLabel={t("provider")}
            disabled={busy}
            value={filters.provider ?? "all"}
            options={[
              { value: "all", label: t("allProviders") },
              ...Array.from(new Set(page.rows.map((row) => row.provider))).map((value) => ({
                value,
                label: value,
              })),
            ]}
            onChange={(value) =>
              load({
                category: filters.category,
                provider: value === "all" ? undefined : value,
              })
            }
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Button disabled={busy || !selected.length} onClick={plan}>
            {t("previewSelected", { count: selected.length })}
          </Button>
          <InfoTooltip text={t("batchLimit", { count: MAX_RECOVERY_BATCH })} />
        </div>
      </div>
      {activeError && !preview && (
        <p role="alert" className="text-sm text-danger">
          {t(`errors.${activeError}`)}
        </p>
      )}
      {batch.commandError && (
        <div className="grid gap-2">
          <p role="status" className="text-sm text-fg-muted">
            {batch.commandError}
          </p>
          <Button variant="secondary" disabled={batch.busy} onClick={batch.onRetryCommand}>
            {t("refresh")}
          </Button>
        </div>
      )}
      {command && (
        <div role="status" className="rounded-xl border border-border p-4 text-sm">
          <p>{t(`commandStates.${command.state}`)}</p>
          <p className="mt-1 text-fg-muted">
            {t("outcomes", {
              queued: command.outcomes.filter((item) => item.status === "queued").length,
              unchanged: command.outcomes.filter((item) => item.status === "unchanged").length,
              recovered: command.outcomes.filter((item) => item.status === "recovered").length,
              failed: command.outcomes.filter((item) => item.status === "failed").length,
              skipped: command.outcomes.filter((item) => item.status === "skipped").length,
            })}
          </p>
          {["completed", "failed"].includes(command.state) && (
            <Button variant="secondary" onClick={() => load()}>
              {t("refresh")}
            </Button>
          )}
        </div>
      )}
      <RecoveryTable
        rows={page.rows}
        selected={selected}
        busy={busy}
        onDetails={setDetail}
        onSelect={selection.select}
      />
      <RecoveryPartialEvidence rows={page.partialEvidence ?? []} />
      <div className="flex gap-3">
        {filters.cursor && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => load({ ...filters, cursor: undefined })}
          >
            {t("firstPage")}
          </Button>
        )}
        {page.nextCursor && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => load({ ...filters, cursor: page.nextCursor ?? undefined })}
          >
            {t("nextPage")}
          </Button>
        )}
      </div>
      <RecoveryDetails row={detail} onClose={() => setDetail(null)} onSaved={() => load()} />
      <RecoveryPreviewDialog
        preview={preview}
        error={batch.batchErrorCode ?? error}
        busy={busy || batch.busy}
        onClose={batch.onClearPreview}
        onCommit={commit}
      />
    </section>
  );
}
