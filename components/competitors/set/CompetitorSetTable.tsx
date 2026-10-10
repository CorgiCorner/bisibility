"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { Input } from "@/components/ui/Input";
import type {
  CompetitorDetails,
  UpdateCompetitorDetailsInput,
} from "@/lib/actions/competitor-set-input";
import type { CompetitorSetSettingsModel } from "@/lib/queries/competitor-set-settings";
import { useTranslations } from "next-intl";
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
  const dateDisplay = useDateDisplay();
  const t = useTranslations("projectCompetitors.ui");
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
        dateDisplay,
        markets,
        projectId,
        replaceMarkets,
        t,
        onEdit: setEditing,
        onRemove: setRemoving,
      }),
    [canEdit, canDelete, dateDisplay, markets, projectId, replaceMarkets, t],
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
      <div
        className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 ${showFinder || competitors.length === 0 ? "border-b border-border" : ""}`}
      >
        <div className="min-w-0">
          <h2 className="m-0 text-[15px] font-semibold text-fg">{t("competitors")}</h2>
          <p className="m-0 mt-1 max-w-xl text-[12.5px] leading-5 text-fg-muted">
            {t("competitorsSettingsDescription")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <Button onClick={() => setFinderOpen(true)} size="sm" type="button" variant="secondary">
              {t("addCompetitor")}
            </Button>
          ) : null}
        </div>
      </div>
      {showFinder ? (
        <div className="px-4 py-3">
          <Input
            aria-label={t("searchCompetitors")}
            className="max-w-45"
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t("searchCompetitors")}
            value={filter}
          />
        </div>
      ) : null}
      {competitors.length === 0 ? (
        <div className="max-w-xl px-4 py-7">
          <h2 className="m-0 text-[13.5px] font-semibold text-fg">{t("noCompetitorsAdded")}</h2>
          <p className="m-0 mt-2 text-[12.5px] leading-5 text-fg-muted">
            {t("noCompetitorsAddedDescription")}
          </p>
        </div>
      ) : (
        <DataTable
          ariaLabel={t("competitors")}
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
