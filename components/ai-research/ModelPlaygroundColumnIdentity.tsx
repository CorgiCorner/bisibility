"use client";
import { FormField } from "@/components/ui/FieldLabel";
import { MenuSelect, type MenuSelectOption } from "@/components/ui/MenuSelect";
import type { ModelPlaygroundCopy } from "@/lib/model-playground/composer-copy";
import {
  availableModels,
  connectionReadiness,
  type ModelConnection,
  type ModelDisplayLabels,
  modelLabel,
  modelProviderName,
  newColumn,
} from "@/lib/model-playground/composer-state";
import type { ModelColumn } from "@/lib/model-playground/types";
import { type ModelCatalogSnapshot, NATIVE_MODEL_PROVIDERS } from "@/lib/providers/model/types";

export function ModelPlaygroundColumnIdentity({
  column,
  modelLabels,
  catalogs,
  connections,
  onChange,
  disabled,
  copy,
}: Readonly<{
  column: ModelColumn;
  modelLabels?: ModelDisplayLabels;
  catalogs: readonly ModelCatalogSnapshot[];
  connections: readonly ModelConnection[];
  onChange: (column: ModelColumn) => void;
  disabled: boolean;
  copy: ModelPlaygroundCopy;
}>) {
  const models = availableModels(catalogs, column.providerId, column.settings.workspaceId);
  const reason = (id: string) => {
    const state = connectionReadiness(connections.find((connection) => connection.id === id));
    return state !== "connected"
      ? copy[state]
      : availableModels(
            catalogs,
            id,
            id === column.providerId ? column.settings.workspaceId : undefined,
          ).length
        ? undefined
        : copy.unavailable;
  };
  const select = (providerId: string, modelId?: string) => {
    const available = availableModels(
      catalogs,
      providerId,
      providerId === column.providerId ? column.settings.workspaceId : undefined,
    );
    const model = modelId ? available.find((item) => item.modelId === modelId) : available[0];
    const connection = connections.find((item) => item.id === providerId);
    if (!disabled && !reason(providerId) && model && connection)
      onChange({
        ...newColumn(model, connection),
        columnId: column.columnId,
        ...(providerId === column.providerId
          ? {
              settings: {
                ...newColumn(model, connection).settings,
                ...(column.settings.workspaceId !== undefined
                  ? { workspaceId: column.settings.workspaceId }
                  : {}),
                ...(column.settings.allowedProviders !== undefined
                  ? { allowedProviders: column.settings.allowedProviders }
                  : {}),
              },
            }
          : {}),
      });
  };
  const modelOptions: MenuSelectOption[] = models.map((model) => ({
    label: modelLabel(model, model.modelId, modelLabels),
    value: model.modelId,
    secondary: model.modelId,
  }));
  if (!modelOptions.some((item) => item.value === column.modelId))
    modelOptions.push({
      label: modelLabels?.[column.providerId]?.[column.modelId] ?? column.modelId,
      value: column.modelId,
      disabled: true,
      secondary: copy.unavailable,
    });
  return (
    <>
      <FormField label={copy.provider}>
        <MenuSelect
          ariaLabel={copy.provider}
          disabled={disabled}
          onChange={(id) => select(id)}
          options={NATIVE_MODEL_PROVIDERS.map((id) => ({
            label: modelProviderName(id),
            value: id,
            disabled: Boolean(reason(id)),
            secondary: reason(id),
            tooltip: reason(id),
          }))}
          size="input"
          triggerClassName="w-fit max-w-full"
          value={column.providerId}
        />
      </FormField>
      <FormField label={copy.model} caption={column.modelId} captionId={`model-${column.columnId}`}>
        <MenuSelect
          ariaDescribedBy={`model-${column.columnId}`}
          ariaLabel={copy.model}
          disabled={disabled || Boolean(reason(column.providerId))}
          onChange={(id) => select(column.providerId, id)}
          options={modelOptions}
          searchable
          size="input"
          triggerClassName="w-fit max-w-full"
          value={column.modelId}
        />
      </FormField>
    </>
  );
}
