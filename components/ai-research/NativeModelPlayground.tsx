"use client";
import type { ModelPlaygroundCatalogLoader } from "@/lib/model-playground/catalog-request";
import { columnBlocker } from "@/lib/model-playground/composer-blockers";
import type { ModelPlaygroundCopy } from "@/lib/model-playground/composer-copy";
import { previousRunCause } from "@/lib/model-playground/composer-revision";
import {
  applySearchIntent,
  catalogEntry,
  firstAvailableColumn,
  type ModelDisplayLabels,
  modelLabel,
  modelProviderName,
} from "@/lib/model-playground/composer-state";
import { projectColumnResult, type ResultColumn } from "@/lib/model-playground/result-view";
import type { ModelColumn } from "@/lib/model-playground/types";
import type { ComponentProps } from "react";
import { useState } from "react";
import { ModelPlaygroundAddColumn } from "./ModelPlaygroundAddColumn";
import { ModelPlaygroundColumnSettings } from "./ModelPlaygroundColumnSettings";
import { type ModelPlaygroundChoice, ModelPlaygroundComposer } from "./ModelPlaygroundComposer";
import { ModelPlaygroundConnect } from "./ModelPlaygroundConnect";
import type { ModelPlaygroundDraftCard } from "./ModelPlaygroundIdleColumn";
import { ModelPlaygroundResults } from "./ModelPlaygroundResults";
import { ModelPlaygroundSetupState } from "./ModelPlaygroundSetupState";
import { type ModelPlaygroundConfig, useModelPlayground } from "./useModelPlayground";
import { useModelPlaygroundCatalogs } from "./useModelPlaygroundCatalogs";
import { useModelPlaygroundCopy } from "./useModelPlaygroundCopy";
import { useModelPlaygroundReport } from "./useModelPlaygroundReport";

export type NativeModelPlaygroundConfig = Omit<ModelPlaygroundConfig, "canRun"> & {
  enabled: true;
  canConnect: boolean;
  copy: ModelPlaygroundCopy;
  languages: readonly ModelPlaygroundChoice[];
  markets: readonly ModelPlaygroundChoice[];
  modelLabels?: ModelDisplayLabels;
  initialResults?: readonly ResultColumn[];
  loadCatalog?: ModelPlaygroundCatalogLoader;
};
type ResultsProps = ComponentProps<typeof ModelPlaygroundResults>;
export function NativeModelPlayground({
  config,
  canRun,
  canTrack = false,
  projectId,
  entities,
  topics,
  sourceOverrides,
}: Readonly<{
  config: NativeModelPlaygroundConfig;
  canRun: boolean;
  canTrack?: boolean;
  projectId: string;
  entities: ResultsProps["entities"];
  topics: ResultsProps["topics"];
  sourceOverrides: ResultsProps["sourceContext"]["overrides"];
}>) {
  const copy = useModelPlaygroundCopy(config.copy);
  const { catalogs, setCatalogs, refreshCatalogs } = useModelPlaygroundCatalogs(
    config.catalogs,
    config.connections,
    config.loadCatalog,
  );
  const [catalogError, setCatalogError] = useState(false);
  const h = useModelPlayground({ ...config, catalogs, canRun });
  const report = useModelPlaygroundReport(projectId, h.result);
  const cause = h.resultDraft ? previousRunCause(h.resultDraft, h.draft, copy) : undefined;
  const previousRunNotice = h.resultDraft
    ? cause
      ? copy.previousRun.replace("{cause}", cause)
      : undefined
    : copy.previousSession;
  const [drawer, setDrawer] = useState<{
    column: ModelColumn;
    mode: "add" | "edit";
    open: boolean;
    nonce: string;
  } | null>(null);
  const disabled = !canRun || h.pending;
  const closeDrawer = () => setDrawer((current) => current && { ...current, open: false });
  const onSettings = (id: string) => {
    const column = h.input.columns.find((item) => item.columnId === id);
    if (column && !disabled)
      setDrawer({ column, mode: "edit", open: true, nonce: crypto.randomUUID() });
  };
  const available = firstAvailableColumn(catalogs, config.connections);
  const addReason =
    h.input.columns.length >= 6
      ? copy.columnLimit
      : !available
        ? copy.noModels
        : !canRun
          ? copy.readOnly
          : h.pending
            ? copy.waiting
            : undefined;
  const draftCards: ModelPlaygroundDraftCard[] = h.input.columns.map((column) => {
    const entry = catalogEntry(catalogs, column);
    const blocker = columnBlocker(column, catalogs, config.connections, copy);
    const blocked = Boolean(blocker);
    return {
      id: column.columnId,
      label:
        config.modelLabels?.[column.providerId]?.[column.modelId] ??
        modelLabel(entry, column.modelId, config.modelLabels),
      modelId: column.modelId,
      providerLabel: modelProviderName(column.providerId),
      fundingSource: column.payment.fundingSource,
      allowedProviders: column.settings.allowedProviders,
      blocked,
      title: blocked ? copy.needsAttention : h.pending ? copy.waiting : copy.ready,
      description:
        blocker ??
        copy.runAsks.replace(
          "{language}",
          config.languages.find((item) => item.code === h.input.responseLanguage)?.name ??
            h.input.responseLanguage,
        ),
      connect: (
        <ModelPlaygroundConnect
          connections={config.connections}
          providerId={column.providerId}
          projectId={projectId}
          canConnect={canRun && config.canConnect}
          copy={copy}
          catalogs={catalogs}
          column={column}
          onRefresh={config.loadCatalog ? refreshCatalogs : undefined}
          size="sm"
        />
      ),
      notices: [...(h.unsupportedSearch.includes(column.columnId) ? [copy.searchUnavailable] : [])],
    };
  });
  const retained =
    report.result?.columns.map((result) => projectColumnResult(result)) ??
    config.initialResults ??
    [];
  const columns = retained.map((result) => {
    const entry = config.catalogs
      .find((catalog) => catalog.providerId === result.providerId)
      ?.models.find((model) => model.modelId === result.modelId);
    return {
      ...result,
      label: modelLabel(entry, result.modelId ?? result.label, config.modelLabels),
    };
  });
  const needsSetup = !available && !h.input.columns.length;
  const project = entities.find((entity) => entity.kind === "project");
  return (
    <div className="grid min-w-0 gap-4" data-native-model-playground>
      {!canRun ? (
        <p className="m-0 text-ui-body text-fg-muted" role="status">
          {copy.readOnly}
        </p>
      ) : null}
      {!needsSetup ? (
        <ModelPlaygroundComposer
          blockers={draftCards
            .filter((card) => card.blocked)
            .map((card) => `${card.label} (${card.providerLabel}): ${card.description}`)}
          controller={h}
          copy={copy}
          disabled={!canRun || h.pending}
          languages={config.languages}
          markets={config.markets}
        />
      ) : null}
      {catalogError ? (
        <p role="status" className="m-0 text-ui-body text-fg-muted">
          {copy.blockedCatalog.replace("{provider}", "Selected provider")}
        </p>
      ) : null}
      <ModelPlaygroundResults
        setupState={
          needsSetup ? (
            <ModelPlaygroundSetupState
              projectId={projectId}
              canConnect={canRun && config.canConnect}
            />
          ) : undefined
        }
        canTrack={canTrack}
        columns={[]}
        entities={entities}
        funding={null}
        onRemove={(id) => {
          if (canRun) h.removeColumn(id);
        }}
        projectId={projectId}
        prompt={h.resultDraft?.input.prompt ?? h.input.prompt}
        reportId={report.reportId}
        retainedRun={
          h.result && h.resultDraft
            ? { runId: h.result.runId, input: h.resultDraft.input }
            : undefined
        }
        reportSaveStatus={report.status}
        onSaveReport={() => {
          if (report.status && ["pending", "check_failed", "read_only"].includes(report.status))
            report.checkAgain();
          else if (h.result) void report.save(h.result.runId);
        }}
        resultColumns={columns}
        previousRunNotice={columns.length ? previousRunNotice : undefined}
        previousMatrixNotice={copy.previousMatrix}
        previousAnswerTemplate={copy.previousAnswer}
        draftCards={draftCards}
        disabled={disabled}
        onSettings={onSettings}
        addColumn={
          !available && !h.input.columns.length ? null : (
            <ModelPlaygroundAddColumn
              reason={addReason}
              connections={config.connections}
              projectId={projectId}
              canConnect={canRun && config.canConnect}
              copy={copy}
              onAdd={() => {
                if (available && !addReason)
                  setDrawer({
                    column: applySearchIntent(
                      { ...h.input, columns: [available] },
                      catalogs,
                      h.search,
                      h.market,
                    ).columns[0],
                    mode: "add",
                    open: true,
                    nonce: crypto.randomUUID(),
                  });
              }}
            />
          )
        }
        running={h.pending}
        topics={topics}
        unfinished={false}
        sourceContext={{
          competitorDomains: entities.flatMap((entity) =>
            entity.kind === "competitor" && entity.domain ? [entity.domain] : [],
          ),
          excludedNames: project?.excludedNames ?? [],
          overrides: sourceOverrides,
          ownDomain: project?.domain ?? null,
        }}
      />
      {drawer ? (
        <ModelPlaygroundColumnSettings
          key={drawer.nonce}
          column={drawer.column}
          catalogs={catalogs}
          connections={config.connections}
          modelLabels={config.modelLabels}
          mode={drawer.mode}
          open={drawer.open}
          onClose={closeDrawer}
          onExited={() =>
            setDrawer((current) =>
              current?.nonce === drawer.nonce && !current.open ? null : current,
            )
          }
          onApply={async (next) => {
            setCatalogError(false);
            if (config.loadCatalog && !catalogEntry(catalogs, next)) {
              try {
                const loaded = await config.loadCatalog(
                  {
                    providerId: next.providerId,
                    connectionId: next.connectionId,
                    ...(next.settings.workspaceId
                      ? { workspaceId: next.settings.workspaceId }
                      : {}),
                  },
                  new AbortController().signal,
                );
                setCatalogs((current) => [
                  ...current.filter(
                    (c) =>
                      c.providerId !== loaded.providerId || c.workspaceId !== loaded.workspaceId,
                  ),
                  loaded,
                ]);
              } catch {
                setCatalogError(true);
                return;
              }
            }
            if (drawer.mode === "add") h.addColumn(next, true);
            else h.updateColumn(next.columnId, next);
            closeDrawer();
          }}
          disabled={disabled || (drawer.mode === "add" && h.input.columns.length >= 6)}
          searchEnabled={h.search}
          market={h.market}
          copy={copy}
        />
      ) : null}
    </div>
  );
}
