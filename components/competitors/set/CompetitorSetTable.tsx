"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { Input } from "@/components/ui/Input";
import type {
  CompetitorDetails,
  UpdateCompetitorDetailsInput,
} from "@/lib/actions/competitor-set-input";
import type { CompetitorSetSettingsModel } from "@/lib/queries/competitor-set-settings";
import { useMemo, useState } from "react";
import { CompetitorDetailsDialog } from "./CompetitorDetailsDialog";
import { competitorSetColumns } from "./competitor-set-columns";
import type { ReplaceMarketsAction } from "./OverrideCell";
import { type RemoveCompetitorAction, RemoveCompetitorDialog } from "./RemoveCompetitorDialog";

type CompetitorSetTableProps = CompetitorSetSettingsModel & {
  addCompetitor: (input: CompetitorDetails & { projectId: string }) => Promise<unknown>;
  canDelete: boolean;
  canEdit: boolean;
  initiallyEditingCompetitorId?: string;
  projectId: string;
  removeCompetitor: RemoveCompetitorAction;
  replaceMarkets: ReplaceMarketsAction;
  updateCompetitor: (input: UpdateCompetitorDetailsInput) => Promise<unknown>;
};
type Competitor = CompetitorSetSettingsModel["competitors"][number];

export function CompetitorSetTable({
  addCompetitor,
  canDelete,
  canEdit,
  competitors,
  initiallyEditingCompetitorId,
  markets,
  projectId,
  removeCompetitor,
  replaceMarkets,
  updateCompetitor,
}: Readonly<CompetitorSetTableProps>) {
  const [filter, setFilter] = useState("");
  const [finderOpen, setFinderOpen] = useState(false);
  const [editing, setEditing] = useState<Competitor | null>(
    () => competitors.find((row) => row.publicId === initiallyEditingCompetitorId) ?? null,
  );
  const [removing, setRemoving] = useState<Competitor | null>(null);
  const columns = useMemo(
    () =>
      competitorSetColumns({
        canEdit,
        canDelete,
        markets,
        projectId,
        replaceMarkets,
        onEdit: setEditing,
        onRemove: setRemoving,
      }),
    [canEdit, canDelete, markets, projectId, replaceMarkets],
  );
  const rows = useMemo(
    () => competitors.map((competitor) => ({ ...competitor, id: competitor.publicId })),
    [competitors],
  );
  const filtered = rows.filter((competitor) =>
    competitor.domain.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const showFinder = competitors.length > 5;

  return (
    <Card className="min-w-0 overflow-hidden p-0" data-competitor-set-table="">
      <div className="flex flex-wrap items-start justify-between gap-3 border-border border-b px-4 py-3.5">
        <div className="min-w-0">
          <h2 className="m-0 text-[15px] font-semibold text-fg">Competitors</h2>
          <p className="m-0 mt-1 max-w-xl text-[12.5px] leading-5 text-fg-muted">
            Manage competitors across your project and choose which markets they appear in.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <Button onClick={() => setFinderOpen(true)} size="sm" type="button" variant="secondary">
              Add competitor
            </Button>
          ) : null}
        </div>
      </div>
      {showFinder ? (
        <div className="border-border border-b px-4 py-3">
          <Input
            aria-label="Search competitors"
            className="max-w-45"
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search competitors"
            value={filter}
          />
        </div>
      ) : null}
      {competitors.length === 0 ? (
        <div className="max-w-xl px-4 py-7">
          <h2 className="m-0 text-[13.5px] font-semibold text-fg">No competitors added</h2>
          <p className="m-0 mt-2 text-[12.5px] leading-5 text-fg-muted">
            Competitors appear here once added to the project. Rank checks do not add them
            automatically.
          </p>
        </div>
      ) : (
        <DataTable
          ariaLabel="Competitors"
          bordered={false}
          columns={columns}
          density="standard"
          id="competitor-set-table"
          layout="auto"
          onSortingChange={() => undefined}
          rowClassName={() => "h-auto! min-h-17 [&>[role=cell]]:py-3"}
          rows={filtered}
          sorting={null}
        />
      )}
      {canEdit && finderOpen ? (
        <CompetitorDetailsDialog
          onClose={() => setFinderOpen(false)}
          onSave={(values) => addCompetitor({ ...values, projectId })}
        />
      ) : null}
      {canEdit && editing ? (
        <CompetitorDetailsDialog
          key={editing.publicId}
          competitor={editing}
          onClose={() => setEditing(null)}
          onSave={(values) =>
            updateCompetitor({ ...values, competitorId: editing.publicId, projectId })
          }
        />
      ) : null}
      {canDelete && removing ? (
        <RemoveCompetitorDialog
          competitor={removing}
          onClose={() => setRemoving(null)}
          projectId={projectId}
          removeCompetitor={removeCompetitor}
        />
      ) : null}
    </Card>
  );
}
