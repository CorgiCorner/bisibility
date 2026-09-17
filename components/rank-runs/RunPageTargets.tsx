import { useDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { itemStatusChipPresentation } from "@/components/ui/status-chip-mapping";
import type { ProjectRef } from "@/lib/routing/app-path";
import { useLocale, useTranslations } from "next-intl";
import { type RunItemFilter, runFilters } from "./RunPageModel";
import { RunPageTargetActions } from "./RunPageTargetActions";
import type { RunPageData, RunPageItem } from "./RunPageTypes";
import { runTargetNote, runTargetTableColumns } from "./run-target-table-columns";

type RunPageTargetsProps = {
  busy: string | null;
  canMutate: boolean;
  cursor: string | null;
  filter: RunItemFilter;
  items: RunPageItem[];
  onCancel: () => void;
  onFilter: (filter: RunItemFilter) => void;
  onLoadMore: () => void;
  onMutate: (mutation: "run-now" | "skip" | "retry-failed" | "retry-deferred") => void;
  projectRef: ProjectRef;
  run: RunPageData;
  summary: { active: boolean; planned: boolean };
};

const ignoreSorting = () => undefined;

function RunPageFilters({
  filter,
  onFilter,
  run,
}: Pick<RunPageTargetsProps, "filter" | "onFilter" | "run">) {
  const t = useTranslations("projectRuns.rankRuns");
  const statusT = useTranslations("shared.controls.status");
  const filters = runFilters(run);
  if (filters.length <= 1) return null;
  return (
    <div
      aria-label={t("filterTargets")}
      className="inline-flex min-h-[34px] items-center gap-0.5 rounded-control border border-border-control p-[3px]"
      role="radiogroup"
    >
      {filters.map(({ count, value }) => {
        const label =
          value === "all" ? t("allTargets") : statusT(itemStatusChipPresentation(value).messageKey);
        return (
          <label
            className={`h-[26px] cursor-pointer rounded-control border px-2.5 text-[12.5px] font-normal leading-[24px] ${filter === value ? "border-border-control bg-nav-active text-fg" : "border-transparent bg-transparent text-fg-muted"}`}
            key={value}
            title={count === null ? undefined : t("targets", { count })}
          >
            <input
              checked={filter === value}
              className="sr-only"
              name="run-check-filter"
              onChange={() => onFilter(value)}
              type="radio"
              value={value}
            />
            {label}
          </label>
        );
      })}
    </div>
  );
}

export function RunPageTargets({
  busy,
  canMutate,
  cursor,
  filter,
  items,
  onCancel,
  onFilter,
  onLoadMore,
  onMutate,
  projectRef,
  run,
  summary,
}: Readonly<RunPageTargetsProps>) {
  const deploymentMode = useDeploymentMode();
  const locale = useLocale();
  const t = useTranslations("projectRuns.rankRuns");
  const statusT = useTranslations("shared.controls.status");
  const live = summary.active && filter === "all";
  const showNotes =
    run.status === "blocked" ||
    items.some((item) => runTargetNote(item, run, deploymentMode, t, locale));
  return (
    <section
      aria-labelledby="run-targets-title"
      className="min-w-0 overflow-hidden rounded-card border border-border bg-bg-elev [&>[role=table]]:border-0"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5">
        <div>
          <h2
            className="m-0 text-[15px] font-semibold leading-[1.35] text-fg"
            id="run-targets-title"
          >
            {t("targetsInRun")}
          </h2>
          <p className="m-0 text-[10px] leading-[1.45] text-fg-muted">
            {live ? t("newestFirst") : t("alphabetical")}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <RunPageFilters filter={filter} onFilter={onFilter} run={run} />
          <RunPageTargetActions
            busy={busy}
            canMutate={canMutate}
            onCancel={onCancel}
            onMutate={onMutate}
            run={run}
            summary={summary}
          />
        </div>
      </header>
      <DataTable
        ariaLabel={t("targetsInRun")}
        columns={runTargetTableColumns({
          deploymentMode,
          locale,
          projectRef,
          run,
          showNotes,
          statusT,
          t,
        })}
        density="compact"
        emptyState={<span className="text-[12px] text-fg-muted">{t("nothingSent")}</span>}
        id="run-page-targets-table"
        layout="auto"
        onSortingChange={ignoreSorting}
        rows={items}
        sorting={null}
      />
      <footer className="flex flex-wrap items-center gap-2.5 px-4 py-3">
        <span
          className="min-w-0 text-[11.5px] leading-[1.5] text-fg-muted"
          title={live ? t("newestFirstActive") : t("alphabeticalByKeyword")}
        >
          {t("targets", { count: items.length })}
        </span>
        {cursor && !summary.active ? (
          <Button onClick={onLoadMore} size="xs" variant="secondary">
            {t("loadMore")}
          </Button>
        ) : null}
      </footer>
    </section>
  );
}
