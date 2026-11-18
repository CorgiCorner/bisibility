"use client";
import {
  currentModelQuote,
  modelConfirmationInput,
  type PendingModelConfirmation,
  pendingModelRead,
} from "@/lib/model-playground/composer-quote";
import {
  type ComposerRevision,
  composerContentKey,
} from "@/lib/model-playground/composer-revision";
import {
  applySearchIntent,
  catalogEntry,
  type ModelConnection,
  validateComposer,
} from "@/lib/model-playground/composer-state";
import {
  isModelPlaygroundConfirmation,
  isModelPlaygroundLaunchRejection,
  type ModelPlaygroundLaunchResult,
  type ModelPlaygroundLaunchService,
} from "@/lib/model-playground/launch-service";
import { MODEL_PLAYGROUND_LIMITS, modelPlaygroundDraftSchema } from "@/lib/model-playground/schema";
import type { ModelColumn, ModelPlaygroundInput } from "@/lib/model-playground/types";
import type { ModelCatalogSnapshot } from "@/lib/providers/model/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import {
  notifyRetainedModelRun,
  useModelPlaygroundFailure,
  useModelPlaygroundLifecycle,
} from "./useModelPlaygroundLifecycle";
import { useModelPlaygroundQuote } from "./useModelPlaygroundQuote";
import { useModelPlaygroundRead } from "./useModelPlaygroundRead";
export type ModelPlaygroundConfig = {
  input: ModelPlaygroundInput;
  catalogs: readonly ModelCatalogSnapshot[];
  connections: readonly ModelConnection[];
  service: ModelPlaygroundLaunchService;
  canRun: boolean;
  debounceMs?: number;
  onRetainedRun?: (runId: string) => Promise<void>;
  initialRun?: ModelPlaygroundLaunchResult;
  searchByDefault?: boolean;
};
export function useModelPlayground({
  input: initialInput,
  catalogs,
  connections,
  service,
  canRun,
  debounceMs = 350,
  onRetainedRun,
  initialRun,
  searchByDefault,
}: ModelPlaygroundConfig) {
  const form = useForm<z.input<typeof modelPlaygroundDraftSchema>, unknown, ModelPlaygroundInput>({
    defaultValues: initialInput,
    resolver: zodResolver(modelPlaygroundDraftSchema),
    mode: "onChange",
  });
  useWatch({ control: form.control });
  const getInput = () => form.getValues() as ModelPlaygroundInput;
  const values = getInput();
  const [search, setSearch] = useState(
    searchByDefault ?? initialInput.columns.some((column) => column.settings.search.mode !== "off"),
  );
  const [market, setMarket] = useState(
    initialInput.columns.find((column) => column.settings.search.countryCode)?.settings.search
      .countryCode ?? "US",
  );
  const [pending, setPending] = useState(false);
  const activeRead = useRef<ModelPlaygroundLaunchResult | null>(null);
  const readContent = useRef<string | null>(null);
  const [appliedEdits, setAppliedEdits] = useState(0);
  const [completed, setCompleted] = useState<{
    result: ModelPlaygroundLaunchResult;
    draft: ComposerRevision;
  } | null>(null);
  const { mounted, refresh } = useModelPlaygroundLifecycle(catalogs);
  const reading = useModelPlaygroundRead(
    service,
    activeRead.current ?? completed?.result ?? initialRun ?? null,
  );
  const launchFence = useRef<string | null>(null);
  const launching = useRef(false);
  const confirmationRef = useRef<string | null>(null);
  const latestRevision = useRef<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const launchKey = useRef<{ revision: string; key: string } | null>(null);
  const serverConfirmation = useRef<PendingModelConfirmation | null>(null);
  const signature = JSON.stringify({ values, search, market, catalogs, connections, appliedEdits });
  const { revision, input } = useMemo(() => {
    const raw = JSON.parse(signature).values as ModelPlaygroundInput;
    const parsed = modelPlaygroundDraftSchema.safeParse(raw);
    return { revision: crypto.randomUUID(), input: parsed.success ? parsed.data : raw };
  }, [signature]);
  const draft = { input, revision, search, market };
  const contentKey = composerContentKey(input);
  const { failure, uncertainContents, clearFailure, rejectLaunch } =
    useModelPlaygroundFailure(contentKey);
  latestRevision.current = revision;
  const needsConfirmation =
    uncertainContents.current.has(contentKey) ||
    (reading.unconfirmed && readContent.current === contentKey);
  const issues = validateComposer(input, catalogs, connections);
  const quoteState = useModelPlaygroundQuote(
    service,
    input,
    revision,
    canRun && !issues.length,
    debounceMs,
  );
  const { failed: quoteFailed } = quoteState;
  const quote = currentModelQuote(quoteState.quote, revision, input);
  const canLaunch =
    canRun &&
    !pending &&
    !reading.pending &&
    !issues.length &&
    Boolean(quote) &&
    (launchFence.current !== revision || needsConfirmation);
  const changeColumns = (columns: ModelColumn[]) =>
    form.setValue("columns", columns, { shouldDirty: true, shouldValidate: true });
  function setSearchIntent(enabled: boolean) {
    changeColumns(applySearchIntent(getInput(), catalogs, enabled, market).columns);
    setSearch(enabled);
  }
  function setMarketHint(next: string) {
    changeColumns(
      getInput().columns.map((column) => {
        const tool = catalogEntry(catalogs, column)?.search.find(
          (item) => item.mode === column.settings.search.mode,
        );
        return tool?.countryHint
          ? {
              ...column,
              settings: {
                ...column.settings,
                search: { ...column.settings.search, countryCode: next },
              },
            }
          : column;
      }),
    );
    setMarket(next);
  }
  async function run(confirmed = false) {
    if (!mounted.current || !quote || !quoteState.isCurrent(quote)) return;
    if (!canLaunch || launching.current || latestRevision.current !== revision) return;
    if (launchFence.current === revision && !needsConfirmation) return;
    if (confirmed && confirmationRef.current !== contentKey) return;
    if (
      Date.parse(quote.expiresAt) <= Date.now() ||
      validateComposer(getInput(), catalogs, connections).length
    ) {
      refresh();
      return;
    }
    const parsed = modelPlaygroundDraftSchema.safeParse(getInput());
    if (!parsed.success || JSON.stringify(parsed.data) !== JSON.stringify(input)) return;
    if (needsConfirmation && !confirmed) {
      confirmationRef.current = contentKey;
      setConfirmation(contentKey);
      return;
    }
    launchFence.current = revision;
    launching.current = true;
    confirmationRef.current = null;
    setConfirmation(null);
    launchKey.current =
      !confirmed && launchKey.current?.revision === revision
        ? launchKey.current
        : { revision, key: crypto.randomUUID() };
    setPending(true);
    activeRead.current = pendingModelRead(quote.previewId, input);
    readContent.current = contentKey;
    clearFailure();
    try {
      const confirm = modelConfirmationInput(serverConfirmation.current, contentKey, confirmed);
      const launched = await service.launch({
        version: 1,
        revision,
        requestId: launchKey.current.key,
        previewId: quote.previewId,
        configHash: quote.configHash,
        quoteToken: quote.quoteToken,
        byokConsent: "non_guaranteed_estimate_v1",
        ...(confirm ? { confirmUnknown: confirm } : {}),
      });
      uncertainContents.current.delete(contentKey);
      if (mounted.current) setCompleted({ result: launched, draft });
      notifyRetainedModelRun(onRetainedRun, launched.runId);
      serverConfirmation.current = null;
      activeRead.current = null;
    } catch (error) {
      if (!mounted.current) return;
      if (isModelPlaygroundConfirmation(error)) {
        activeRead.current = null;
        serverConfirmation.current = { contentKey, value: error };
        uncertainContents.current.add(contentKey);
        confirmationRef.current = contentKey;
        if (mounted.current) setConfirmation(contentKey);
        return;
      }
      const definite = isModelPlaygroundLaunchRejection(error);
      activeRead.current = null;
      if (definite) {
        launchFence.current = null;
        launchKey.current = null;
      }
      rejectLaunch(contentKey, definite);
      if (definite) await quoteState.invalidate();
    } finally {
      launching.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return {
    form,
    input,
    search,
    market,
    quote,
    issues,
    pending: pending || reading.pending,
    result: reading.result,
    resultDraft: completed?.draft,
    draft,
    failed: failure !== null,
    failure,
    quoteFailed,
    canLaunch,
    revision,
    setSearch: setSearchIntent,
    setMarket: setMarketHint,
    run: () => run(),
    confirmationOpen: confirmation === contentKey,
    confirmRetry: () => run(true),
    cancelRetry: () => {
      confirmationRef.current = null;
      setConfirmation(null);
    },
    unsupportedSearch: search
      ? input.columns
          .filter(
            (column) =>
              !catalogEntry(catalogs, column)?.search.some((tool) => tool.evidence.fixtureRevision),
          )
          .map((column) => column.columnId)
      : [],
    addColumn(column: ModelColumn, configured = false) {
      const current = getInput().columns;
      if (current.length < MODEL_PLAYGROUND_LIMITS.columns)
        changeColumns([
          ...current,
          ...(configured
            ? [column]
            : applySearchIntent({ ...getInput(), columns: [column] }, catalogs, search, market)
                .columns),
        ]);
    },
    removeColumn(id: string) {
      changeColumns(getInput().columns.filter((column) => column.columnId !== id));
    },
    reconfigureColumn(id: string, next: ModelColumn) {
      const configured = applySearchIntent(
        { ...getInput(), columns: [next] },
        catalogs,
        search,
        market,
      ).columns[0];
      changeColumns(
        getInput().columns.map((column) =>
          column.columnId === id ? { ...configured, columnId: id } : column,
        ),
      );
    },
    updateColumn(id: string, next: ModelColumn) {
      setAppliedEdits((count) => count + 1);
      changeColumns(
        getInput().columns.map((column) =>
          column.columnId === id ? { ...next, columnId: id } : column,
        ),
      );
    },
    moveColumn(id: string, offset: number) {
      const columns = [...getInput().columns];
      const from = columns.findIndex((column) => column.columnId === id);
      const to = from + offset;
      if (from < 0 || to < 0 || to >= columns.length) return;
      [columns[from], columns[to]] = [columns[to], columns[from]];
      changeColumns(columns);
    },
  };
}
export type ModelPlaygroundController = ReturnType<typeof useModelPlayground>;
