"use client";

import { useNativeUsageFormat } from "@/components/cost-estimate/useNativeUsageFormat";
import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { useRunStatusCopy } from "@/components/project-runs/run-status-copy";
import { useDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListChecksIcon as ListChecks } from "@phosphor-icons/react/dist/csr/ListChecks";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type RunsTableRow, rankRunHref, runsTableColumns } from "./runs-table-columns";
import type { RankRunRecord } from "./runs-types";

type RunsTableProps = {
  emptyActionHref: string;
  projectRef: string;
  rows: readonly RankRunRecord[];
};

const ignoreSorting = () => undefined;

export function RunsTable({ emptyActionHref, projectRef, rows }: Readonly<RunsTableProps>) {
  const usage = useNativeUsageFormat();
  const dateFormat = useDateFormat();
  const deploymentMode = useDeploymentMode();
  const locale = useLocale();
  const t = useTranslations("projectRuns.rankRuns");
  const statusT = useTranslations("shared.controls.status");
  const statusCopy = useRunStatusCopy();
  const router = useRouter();
  const tableRows: readonly RunsTableRow[] = rows.map((run) => ({ id: run.id, kind: "row", run }));
  if (rows.length === 0) {
    return (
      <div className="px-4 py-11">
        <EmptyState
          action={
            <Button href={emptyActionHref} size="sm" variant="secondary">
              {t("manageSchedules")}
            </Button>
          }
          description={t("emptyDescription")}
          icon={<ListChecks size={22} weight="regular" />}
          title={t("emptyTitle")}
        />
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <DataTable
        bordered={false}
        ariaLabel={t("runs")}
        columns={runsTableColumns({
          usage,
          dateFormat,
          deploymentMode,
          locale,
          projectRef,
          statusCopy,
          statusT,
          t,
        })}
        density="standard"
        id="rank-runs-table"
        layout="auto"
        onRowClick={(row) => router.push(rankRunHref(projectRef, row.run.id))}
        onSortingChange={ignoreSorting}
        rows={tableRows}
        sorting={null}
      />
    </div>
  );
}
