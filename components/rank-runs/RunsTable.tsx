"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { useDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListChecksIcon as ListChecks } from "@phosphor-icons/react/dist/csr/ListChecks";
import { useRouter } from "next/navigation";
import { type RunsTableRow, rankRunHref, runsTableColumns } from "./runs-table-columns";
import type { RankRunRecord } from "./runs-types";

type RunsTableProps = {
  emptyActionHref: string;
  projectRef: string;
  rows: readonly RankRunRecord[];
};

const ignoreSorting = () => undefined;

export function RunsTable({ emptyActionHref, projectRef, rows }: Readonly<RunsTableProps>) {
  const dateFormat = useDateFormat();
  const deploymentMode = useDeploymentMode();
  const router = useRouter();
  const tableRows: readonly RunsTableRow[] = rows.map((run) => ({ id: run.id, kind: "row", run }));
  if (rows.length === 0) {
    return (
      <div className="px-4 py-11">
        <EmptyState
          action={
            <Button href={emptyActionHref} size="sm" variant="secondary">
              Manage schedules
            </Button>
          }
          description="Runs appear here when a run starts - manually, from a schedule, or through the API."
          icon={<ListChecks size={22} weight="regular" />}
          title="No runs yet"
        />
      </div>
    );
  }

  return (
    <div className="min-w-0 [&>[role=table]]:border-0">
      <DataTable
        ariaLabel="Runs"
        columns={runsTableColumns({ dateFormat, deploymentMode, projectRef })}
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
