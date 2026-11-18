"use client";
import { AppDrawer } from "@/components/ui/AppDrawer";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { composerColumnSchema } from "@/lib/model-playground/composer-column-schema";
import type { ModelPlaygroundCopy } from "@/lib/model-playground/composer-copy";
import {
  applySearchIntent,
  catalogEntry,
  type ModelConnection,
  type ModelDisplayLabels,
  validateComposer,
} from "@/lib/model-playground/composer-state";
import { modelColumnSchema } from "@/lib/model-playground/schema";
import type { ModelColumn } from "@/lib/model-playground/types";
import type { ModelCatalogSnapshot } from "@/lib/providers/model/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { ModelPlaygroundColumnIdentity } from "./ModelPlaygroundColumnIdentity";
import { ModelPlaygroundRoutingFields } from "./ModelPlaygroundRoutingFields";

export function ModelPlaygroundColumnSettings({
  column,
  modelLabels,
  catalogs,
  connections,
  mode,
  open,
  onClose,
  onExited,
  onApply,
  disabled,
  searchEnabled,
  market,
  copy,
}: Readonly<{
  column: ModelColumn;
  modelLabels?: ModelDisplayLabels;
  catalogs: readonly ModelCatalogSnapshot[];
  connections: readonly ModelConnection[];
  mode: "add" | "edit";
  open: boolean;
  onClose: () => void;
  onExited: () => void;
  onApply: (column: ModelColumn) => void;
  disabled: boolean;
  searchEnabled: boolean;
  market: string;
  copy: ModelPlaygroundCopy;
}>) {
  const form = useForm<z.input<typeof modelColumnSchema>, unknown, ModelColumn>({
    defaultValues: column,
    resolver: zodResolver(composerColumnSchema(catalogs)),
    mode: "onChange",
  });
  useWatch({ control: form.control });
  const draft = form.getValues() as ModelColumn;
  const entry = catalogEntry(catalogs, draft);
  const tool = entry?.search.find((item) => item.evidence.fixtureRevision);
  const scopeChanged =
    draft.providerId === "anthropic" &&
    column.providerId === "anthropic" &&
    draft.settings.workspaceId !== column.settings.workspaceId;
  const issues = scopeChanged
    ? modelColumnSchema.safeParse(draft).success
      ? []
      : ["Invalid workspace settings."]
    : validateComposer(
        { version: 1, prompt: "Column", responseLanguage: "en", columns: [draft] },
        catalogs,
        connections,
      );
  const prefix = useId();
  const errors = form.formState.errors.settings;
  const tokensError = errors?.maxOutputTokens?.message;
  const temperatureError = errors?.temperature?.message;
  const callsError = errors?.search?.maxCalls?.message;
  const update = (settings: ModelColumn["settings"]) =>
    form.setValue("settings", settings, { shouldDirty: true, shouldValidate: true });
  const submit = form.handleSubmit((value) => {
    if (!disabled && !issues.length) onApply(value);
  });
  return (
    <AppDrawer
      open={open}
      onClose={onClose}
      onExited={onExited}
      title={mode === "add" ? copy.addModel : copy.settings}
      footer={
        <div className="flex justify-end gap-2" data-column-settings-footer>
          <Button
            className="flex-none"
            size="input"
            onClick={onClose}
            type="button"
            variant="outline"
          >
            {copy.cancel}
          </Button>
          <Button
            className="flex-none"
            size="input"
            form={prefix}
            type="submit"
            disabled={disabled || issues.length > 0}
          >
            {mode === "add" ? copy.addModel : copy.save}
          </Button>
        </div>
      }
    >
      <form
        className="grid min-w-0 gap-4"
        data-column-settings
        id={prefix}
        onSubmit={submit}
        noValidate
      >
        <ModelPlaygroundColumnIdentity
          column={draft}
          modelLabels={modelLabels}
          catalogs={catalogs}
          connections={connections}
          copy={copy}
          disabled={disabled}
          onChange={(next) =>
            form.reset(
              applySearchIntent(
                { version: 1, prompt: "Column", responseLanguage: "en", columns: [next] },
                catalogs,
                searchEnabled,
                market,
              ).columns[0],
            )
          }
        />
        <ModelPlaygroundRoutingFields
          key={draft.providerId}
          column={draft}
          disabled={disabled}
          onChange={update}
        />
        {scopeChanged ? (
          <p className="m-0 text-ui-caption text-fg-muted">
            Apply this workspace, then refresh its model catalog before running.
          </p>
        ) : null}
        <FormField
          htmlFor={`${prefix}-tokens`}
          label={copy.outputTokens}
          caption={`16 - ${Math.min(4096, entry?.maxOutputTokens ?? 4096)}`}
        >
          <Input
            id={`${prefix}-tokens`}
            aria-invalid={Boolean(tokensError)}
            className={tokensError ? "border-red focus:border-red" : ""}
            aria-describedby={tokensError ? `${prefix}-tokens-error` : undefined}
            type="number"
            min={16}
            max={Math.min(4096, entry?.maxOutputTokens ?? 4096)}
            disabled={disabled || !entry}
            value={
              Number.isFinite(draft.settings.maxOutputTokens) ? draft.settings.maxOutputTokens : ""
            }
            onChange={(event) =>
              update({ ...draft.settings, maxOutputTokens: event.target.valueAsNumber })
            }
          />
          {tokensError ? (
            <p id={`${prefix}-tokens-error`} className="m-0 text-ui-caption text-red-text">
              {tokensError}
            </p>
          ) : null}
        </FormField>
        {entry?.temperature ? (
          <FormField htmlFor={`${prefix}-temperature`} label={copy.temperature} caption="0 - 2">
            <Input
              id={`${prefix}-temperature`}
              aria-invalid={Boolean(temperatureError)}
              className={temperatureError ? "border-red focus:border-red" : ""}
              aria-describedby={temperatureError ? `${prefix}-temperature-error` : undefined}
              type="number"
              min={0}
              max={2}
              step={0.1}
              disabled={disabled}
              value={draft.settings.temperature ?? ""}
              onChange={(event) => {
                const { temperature: _temperature, ...settings } = draft.settings;
                update(
                  event.target.value === ""
                    ? settings
                    : { ...settings, temperature: event.target.valueAsNumber },
                );
              }}
            />
            {temperatureError ? (
              <p id={`${prefix}-temperature-error`} className="m-0 text-ui-caption text-red-text">
                {temperatureError}
              </p>
            ) : null}
          </FormField>
        ) : null}
        {tool ? (
          <FormField
            label={copy.searchMode}
            caption={
              !searchEnabled
                ? copy.searchOff
                : !tool.countryHint
                  ? copy.searchHintUnavailable
                  : undefined
            }
          >
            <MenuSelect
              ariaLabel={copy.searchMode}
              disabled={disabled || !searchEnabled}
              options={[
                { label: copy.searchOff, value: "off" },
                { label: copy.searchOn, value: tool.mode },
              ]}
              size="input"
              triggerClassName="w-fit max-w-full"
              value={draft.settings.search.mode}
              onChange={(mode) =>
                update({
                  ...draft.settings,
                  search:
                    mode === "off"
                      ? { mode: "off" }
                      : {
                          mode: tool.mode,
                          ...(tool.countryHint ? { countryCode: market } : {}),
                          ...(tool.maxCalls !== null ? { maxCalls: 1 } : {}),
                        },
                })
              }
            />
          </FormField>
        ) : (
          <p className="m-0 text-ui-caption text-fg-muted">{copy.searchUnavailable}</p>
        )}
        {tool?.maxCalls != null && draft.settings.search.mode !== "off" ? (
          <FormField
            htmlFor={`${prefix}-calls`}
            label={copy.searchLimit}
            caption={`1 - ${Math.min(10, tool.maxCalls)}`}
          >
            <Input
              id={`${prefix}-calls`}
              aria-invalid={Boolean(callsError)}
              className={callsError ? "border-red focus:border-red" : ""}
              aria-describedby={callsError ? `${prefix}-calls-error` : undefined}
              type="number"
              min={1}
              max={Math.min(10, tool.maxCalls)}
              disabled={disabled}
              value={
                draft.settings.search.maxCalls == null ||
                !Number.isFinite(draft.settings.search.maxCalls)
                  ? ""
                  : draft.settings.search.maxCalls
              }
              onChange={(event) =>
                update({
                  ...draft.settings,
                  search: { ...draft.settings.search, maxCalls: event.target.valueAsNumber },
                })
              }
            />
            {callsError ? (
              <p id={`${prefix}-calls-error`} className="m-0 text-ui-caption text-red-text">
                {callsError}
              </p>
            ) : null}
          </FormField>
        ) : null}
        {issues.length ? (
          <p className="m-0 text-ui-caption text-red-text" role="alert">
            {copy.invalidDraft}
          </p>
        ) : null}
      </form>
    </AppDrawer>
  );
}
