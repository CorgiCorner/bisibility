"use client";

import type { KeywordWorkspaceActions } from "@/components/keywords/action-utils";
import { AddKeywordDrawer } from "@/components/keywords/add/AddKeywordDrawer";
import { ArchiveMarketDialog } from "@/components/markets/page/ArchiveMarketDialog";
import { MarketEditSheet } from "@/components/markets/page/MarketEditSheet";
import { MarketsTable } from "@/components/markets/page/MarketsTable";
import { RestoreMarketDialog } from "@/components/markets/page/RestoreMarketDialog";
import { NewMarketSheet } from "@/components/markets/sheet/NewMarketSheet";
import { useRunPreflight } from "@/components/rank-runs/useRunPreflight";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModuleMark } from "@/components/ui/ModuleMark";
import { Tabs } from "@/components/ui/Tabs";
import type { NewMarketCreateResult } from "@/lib/markets/create-input";
import type { MarketsPageRow } from "@/lib/markets/page-model";
import type { ProjectMarketEditInput } from "@/lib/markets/project-market-edit";
import type { ArchivedProjectMarketsView, ProjectMarketsView } from "@/lib/queries/project-markets";
import { MapPinIcon as MapPin } from "@phosphor-icons/react/dist/csr/MapPin";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { archivedRow, normalRow } from "./market-page-rows";

type MarketsPageContentProps = Pick<KeywordWorkspaceActions, "addKeywordsAction"> & {
  archivedMarkets: ArchivedProjectMarketsView;
  canAddKeywords: boolean;
  canCreateMarket?: boolean;
  canArchive: boolean;
  canEdit: boolean;
  canRestore: boolean;
  canRunChecks?: boolean;
  createMarketAction?: (input: unknown) => Promise<NewMarketCreateResult>;
  markets: ProjectMarketsView;
  onArchive: (input: { marketId: string; projectId: string }) => Promise<unknown>;
  onRestore: (input: { marketId: string; projectId: string }) => Promise<unknown>;
  onSave: (input: ProjectMarketEditInput) => Promise<unknown>;
  onStatusChange: (input: {
    enabled: boolean;
    marketId: string;
    projectId: string;
  }) => Promise<{ status: string }>;
  openNewMarket?: boolean;
};

function NewMarketSeam({
  canCreate,
  onOpen,
}: Readonly<{ canCreate: boolean; onOpen: () => void }>) {
  const t = useTranslations("projectMarkets");
  return (
    <Button
      data-new-market-seam="b2"
      disabled={!canCreate}
      onClick={onOpen}
      size="sm"
      variant="secondary"
    >
      {t("newMarket")}
    </Button>
  );
}

function MarketsEmptyState({
  archived,
  canCreate,
  onOpen,
}: Readonly<{ archived: boolean; canCreate: boolean; onOpen: () => void }>) {
  const t = useTranslations("projectMarkets");
  return (
    <EmptyState
      action={<NewMarketSeam canCreate={canCreate} onOpen={onOpen} />}
      description={archived ? t("restoreArchivedHint") : t("trackFirstDescription")}
      mark={<ModuleMark bordered icon={MapPin} label={t("markets")} />}
      title={archived ? t("noArchivedMarkets") : t("trackFirst")}
    />
  );
}

export function MarketsPageContent({
  addKeywordsAction,
  archivedMarkets,
  canAddKeywords,
  canCreateMarket = false,
  canArchive,
  canEdit,
  canRestore,
  canRunChecks = false,
  createMarketAction,
  markets,
  onArchive,
  onRestore,
  onSave,
  onStatusChange,
  openNewMarket = false,
}: Readonly<MarketsPageContentProps>) {
  const t = useTranslations("projectMarkets");
  const pathname = usePathname();
  const router = useRouter();
  const [archiveTarget, setArchiveTarget] = useState<MarketsPageRow | null>(null);
  const [editTarget, setEditTarget] = useState<MarketsPageRow | null>(null);
  const [keywordTarget, setKeywordTarget] = useState<MarketsPageRow | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<MarketsPageRow | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const panelId = useId();
  const defaults = markets.marketCreation?.scheduleContext?.projectDefaults;
  const preflight = useRunPreflight({
    projectId: markets.projectId,
    providerId: defaults?.provider?.value,
  });
  const runMarket = (market: MarketsPageRow) => {
    if (!canRunChecks || market.status !== "active") return;
    void preflight.requestMarket(
      { canonicalKey: market.canonicalKey, label: market.name },
      defaults?.serpDepth,
    );
  };
  const visibleRows = markets.markets.map(normalRow);
  const removedRows = archivedMarkets.markets.map(archivedRow);
  const rows = showArchived ? removedRows : visibleRows;
  const marketCreation = markets.marketCreation ?? { registry: [], schedules: [], sources: [] };

  function openMarketSheet() {
    router.push(`${pathname}?new-market=1`);
  }

  function closeMarketSheet() {
    router.replace(pathname);
  }

  async function archive(market: MarketsPageRow) {
    await onArchive({ marketId: market.id, projectId: markets.projectId });
    router.refresh();
  }

  async function restore(market: MarketsPageRow) {
    await onRestore({ marketId: market.id, projectId: markets.projectId });
    router.refresh();
  }

  async function save(input: ProjectMarketEditInput) {
    await onSave(input);
    router.refresh();
  }

  return (
    <div className="grid gap-5" data-markets-page="">
      {preflight.dialog}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border">
        <Tabs
          ariaLabel={t("visibility")}
          onChange={(view) => setShowArchived(view === "archived")}
          options={[
            { label: t("activeAndPaused"), value: "active" },
            { label: t("archived"), value: "archived" },
          ]}
          panelId={panelId}
          value={showArchived ? "archived" : "active"}
        />
        <NewMarketSeam canCreate={canCreateMarket} onOpen={openMarketSheet} />
      </div>
      <div
        aria-labelledby={`${panelId}-${showArchived ? "archived" : "active"}-tab`}
        className="min-w-0"
        id={panelId}
        role="tabpanel"
      >
        {rows.length === 0 ? (
          <MarketsEmptyState
            archived={showArchived}
            canCreate={canCreateMarket}
            onOpen={openMarketSheet}
          />
        ) : showArchived ? (
          <section className="overflow-hidden rounded-card border border-border bg-bg-elev">
            <div className="divide-y divide-border">
              {removedRows.map((market) => (
                <div className="flex flex-wrap items-center gap-3 px-4 py-3" key={market.id}>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 font-medium text-fg">{market.name}</p>
                    <p className="m-0 mt-0.5 text-[12px] text-fg-muted">
                      {market.displayName} / {market.languageLabel} - {t("keywordCount")}:{" "}
                      {market.keywordCount}
                    </p>
                  </div>
                  <Button
                    disabled={!canRestore}
                    onClick={() => setRestoreTarget(market)}
                    size="sm"
                    variant="secondary"
                  >
                    {t("restore")}
                  </Button>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <div className="grid gap-4">
            <MarketsTable
              canAddKeywords={canAddKeywords}
              canArchive={canArchive}
              canEdit={canEdit}
              canRunChecks={canRunChecks && !preflight.opening}
              onRunChecks={runMarket}
              key={`active:${visibleRows.map((market) => `${market.id}:${market.status}`).join(":")}`}
              onArchive={setArchiveTarget}
              onAddKeywords={setKeywordTarget}
              onEdit={setEditTarget}
              onStatusChange={(input) => onStatusChange({ ...input, projectId: markets.projectId })}
              onStatusConfirmed={router.refresh}
              projectId={markets.projectId}
              rows={visibleRows.filter((market) => market.status === "active")}
              title={t("activeMarkets")}
            />
            {visibleRows.some((market) => market.status === "paused") ? (
              <MarketsTable
                canAddKeywords={canAddKeywords}
                canArchive={canArchive}
                canEdit={canEdit}
                key={`paused:${visibleRows.map((market) => `${market.id}:${market.status}`).join(":")}`}
                onArchive={setArchiveTarget}
                onAddKeywords={setKeywordTarget}
                onEdit={setEditTarget}
                onStatusChange={(input) =>
                  onStatusChange({ ...input, projectId: markets.projectId })
                }
                onStatusConfirmed={router.refresh}
                projectId={markets.projectId}
                rows={visibleRows.filter((market) => market.status === "paused")}
                title={t("pausedMarkets")}
              />
            ) : null}
          </div>
        )}
      </div>
      <ArchiveMarketDialog
        key={`archive:${archiveTarget?.id ?? "closed"}`}
        market={archiveTarget}
        onArchive={archive}
        onClose={() => setArchiveTarget(null)}
      />
      <RestoreMarketDialog
        key={`restore:${restoreTarget?.id ?? "closed"}`}
        market={restoreTarget}
        onClose={() => setRestoreTarget(null)}
        onRestore={restore}
      />
      <MarketEditSheet
        canEdit={canEdit}
        key={`edit:${editTarget?.id ?? "closed"}`}
        market={editTarget}
        onClose={() => setEditTarget(null)}
        onSave={save}
        projectId={markets.projectId}
      />
      <AddKeywordDrawer
        addKeywordsAction={addKeywordsAction}
        initialDevices={keywordTarget?.futureKeywordDevices}
        initialMarketKeys={keywordTarget ? [keywordTarget.canonicalKey] : []}
        key={`keywords:${keywordTarget?.id ?? "closed"}`}
        onClose={() => setKeywordTarget(null)}
        open={keywordTarget !== null}
        projectId={markets.projectId}
        projectMarkets={markets}
      />
      {createMarketAction ? (
        <NewMarketSheet
          onClose={closeMarketSheet}
          onCreate={createMarketAction}
          open={openNewMarket}
          projectId={markets.projectId}
          registry={marketCreation.registry}
          schedules={marketCreation.schedules}
          scheduleContext={marketCreation.scheduleContext}
          sources={marketCreation.sources}
        />
      ) : null}
    </div>
  );
}
