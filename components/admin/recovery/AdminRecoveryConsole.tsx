"use client";
import { Button } from "@/components/ui/Button";
import { MenuSelect } from "@/components/ui/MenuSelect";
import {
  commitRecoveryAction,
  getRecoveryCommandAction,
  loadRecoveryPageAction,
  previewRecoveryAction,
} from "@/lib/actions/metering-recovery";
import type {
  RecoveryCase,
  RecoveryFilters,
  RecoveryPage,
  RecoveryPreview,
  RecoveryUiError,
} from "@/lib/metering/recovery/contract";
import { MAX_RECOVERY_BATCH } from "@/lib/metering/recovery/input";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useCallback, useState, useTransition } from "react";
import { RecoveryDetails } from "./RecoveryDetails";
import { RecoveryPreviewDialog } from "./RecoveryPreviewDialog";
import { RecoverySummary } from "./RecoverySummary";
import { RecoveryTable } from "./RecoveryTable";

export function AdminRecoveryConsole({ initial }: { initial: RecoveryPage | null }) {
  const [client] = useState(() => new QueryClient());
  const [loaded, setLoaded] = useState(initial);
  const [loading, startLoad] = useTransition();
  const t = useTranslations("instanceAdmin.recovery");
  return (
    <QueryClientProvider client={client}>
      {loaded ? (
        <RecoveryConsole initial={loaded} />
      ) : (
        <div className="grid gap-3">
          <p role="status">{t("unavailable")}</p>
          <Button
            disabled={loading}
            onClick={() =>
              startLoad(async () => {
                const result = await loadRecoveryPageAction({});
                if (result.ok) setLoaded(result.value);
              })
            }
          >
            {t("refresh")}
          </Button>
        </div>
      )}
    </QueryClientProvider>
  );
}
function RecoveryConsole({ initial }: { initial: RecoveryPage }) {
  const t = useTranslations("instanceAdmin.recovery"),
    [busy, start] = useTransition();
  const [page, setPage] = useState(initial),
    [filters, setFilters] = useState<RecoveryFilters>({ category: "all" });
  const [selected, setSelected] = useState<string[]>([]),
    [detail, setDetail] = useState<RecoveryCase | null>(null);
  const [preview, setPreview] = useState<RecoveryPreview | null>(null),
    [requestId, setRequestId] = useState<string | null>(null);
  const [commandId, setCommandId] = useState<string | null>(null),
    [error, setError] = useState<RecoveryUiError | null>(null);
  const selectCase = useCallback((token: string, checked: boolean) => {
    setSelected((previous) =>
      checked
        ? previous.includes(token) || previous.length >= MAX_RECOVERY_BATCH
          ? previous
          : [...previous, token]
        : previous.filter((value) => value !== token),
    );
  }, []);
  const command = useQuery({
    queryKey: ["admin-recovery-command", commandId],
    enabled: commandId !== null,
    queryFn: () => getRecoveryCommandAction(commandId ?? ""),
    refetchInterval: (query) => {
      const data = query.state.data;
      return (data?.ok && ["completed", "failed"].includes(data.value.state)) ||
        (data?.ok === false && (data.code === "forbidden" || query.state.dataUpdateCount >= 10))
        ? false
        : 3000;
    },
  });
  function load(next: RecoveryFilters = filters) {
    start(async () => {
      const result = await loadRecoveryPageAction(next);
      if (result.ok) {
        setPage(result.value);
        setFilters(next);
        setSelected([]);
        setDetail(null);
        setError(null);
      } else setError(result.code);
    });
  }
  function plan() {
    start(async () => {
      const result = await previewRecoveryAction({ caseTokens: selected });
      if (result.ok) {
        setPreview(result.value);
        setRequestId(crypto.randomUUID());
        setError(null);
      } else setError(result.code);
    });
  }
  function commit() {
    if (!preview || !requestId) return;
    const token = preview.token,
      id = requestId;
    start(async () => {
      try {
        const result = await commitRecoveryAction({ previewToken: token, commandId: id });
        if (result.ok) {
          setCommandId(id);
          setPreview(null);
          setSelected([]);
          setError(null);
        } else {
          if (result.code === "unavailable") setCommandId(id);
          else setPreview(null);
          setError(result.code);
        }
      } catch {
        setCommandId(id);
        setError("unavailable");
      }
    });
  }
  return (
    <section className="grid min-w-0 gap-5" aria-label={t("heading")}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t("heading")}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t("description")}</p>
          <p className="mt-2 break-all text-xs text-fg-muted">
            {page.instance} · {t("namespace")}: {page.namespace}
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => load({ ...filters, cursor: undefined })}
        >
          <ArrowClockwiseIcon aria-hidden />
          {t("refresh")}
        </Button>
      </div>
      <RecoverySummary page={page} />
      <p className="rounded-xl border border-border p-3 text-sm leading-relaxed text-fg-muted">
        {t("safetyNote")}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <MenuSelect
          ariaLabel={t("category")}
          disabled={busy}
          value={filters.category ?? "all"}
          options={(["all", "unfinished", "accounting", "failed", "historical"] as const).map(
            (value) => ({ value, label: t(`categories.${value}`) }),
          )}
          onChange={(value) =>
            load({ category: value as RecoveryFilters["category"], provider: filters.provider })
          }
        />
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
            load({ category: filters.category, provider: value === "all" ? undefined : value })
          }
        />
        <Button disabled={busy || !selected.length} onClick={plan}>
          {t("previewSelected", { count: selected.length })}
        </Button>
        <p className="text-xs text-fg-muted">{t("batchLimit", { count: MAX_RECOVERY_BATCH })}</p>
      </div>
      {error && !preview && (
        <p role="alert" className="text-sm text-danger">
          {t(`errors.${error}`)}
        </p>
      )}
      {command.data?.ok === false && (
        <div className="grid gap-2">
          <p role="status" className="text-sm text-fg-muted">
            {t(`errors.${command.data.code}`)}
          </p>
          <Button
            variant="secondary"
            disabled={command.isFetching}
            onClick={() => void command.refetch()}
          >
            {t("refresh")}
          </Button>
        </div>
      )}
      {command.data?.ok && (
        <div role="status" className="rounded-xl border border-border p-4 text-sm">
          <p>{t(`commandStates.${command.data.value.state}`)}</p>
          <p className="mt-1 text-fg-muted">
            {t("outcomes", {
              queued: command.data.value.outcomes.filter((item) => item.status === "queued").length,
              unchanged: command.data.value.outcomes.filter((item) => item.status === "unchanged")
                .length,
              recovered: command.data.value.outcomes.filter((item) => item.status === "recovered")
                .length,
              failed: command.data.value.outcomes.filter((item) => item.status === "failed").length,
              skipped: command.data.value.outcomes.filter((item) => item.status === "skipped")
                .length,
            })}
          </p>
          {["completed", "failed"].includes(command.data.value.state) && (
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
        onSelect={selectCase}
      />
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
        error={error}
        busy={busy}
        onClose={() => setPreview(null)}
        onCommit={commit}
      />
    </section>
  );
}
