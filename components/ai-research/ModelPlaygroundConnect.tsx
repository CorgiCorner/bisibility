"use client";
import { Button, type ButtonSize } from "@/components/ui/Button";
import type { ModelPlaygroundCopy } from "@/lib/model-playground/composer-copy";
import {
  connectionReadiness,
  type ModelConnection,
  modelProviderName,
} from "@/lib/model-playground/composer-state";
import type { ModelColumn } from "@/lib/model-playground/types";
import type { ModelCatalogSnapshot, NativeModelProviderId } from "@/lib/providers/model/types";
import { appPath } from "@/lib/routing/app-path";
import { useTranslations } from "next-intl";

/** Use the project provider setup only when a selected or additional provider needs connecting. */
export function ModelPlaygroundConnect({
  connections,
  providerId,
  projectId,
  canConnect,
  copy,
  size = "input",
  catalogs,
  column,
  onRefresh,
}: Readonly<{
  connections: readonly ModelConnection[];
  providerId?: NativeModelProviderId;
  projectId: string;
  canConnect: boolean;
  copy: ModelPlaygroundCopy;
  size?: ButtonSize;
  catalogs?: readonly ModelCatalogSnapshot[];
  column?: ModelColumn;
  onRefresh?: () => void;
}>) {
  const t = useTranslations("projectAiResearch.modelPlayground");
  const connection = connections.find((item) => item.id === providerId);
  const state = connectionReadiness(connection);
  if (
    column &&
    onRefresh &&
    catalogs?.some(
      (catalog) =>
        catalog.providerId === column.providerId &&
        catalog.workspaceId === column.settings.workspaceId &&
        Date.parse(catalog.expiresAt) <= Date.now(),
    )
  )
    return (
      <Button size={size} variant="outline" onClick={onRefresh}>
        {t("refreshModels")}
      </Button>
    );
  if (
    providerId
      ? state === "connected" || state === "unavailable"
      : !connections.some((item) =>
          ["missing", "reauth", "disabled"].includes(connectionReadiness(item)),
        )
  )
    return null;
  const action = providerId && state === "reauth" ? copy.reconnect : copy.connect;
  const label = providerId ? `${action} ${modelProviderName(providerId)}` : action;
  return (
    <div className="flex justify-start">
      <Button
        disabled={!canConnect}
        href={
          canConnect
            ? `${appPath(projectId, "providers")}${providerId ? `?connect=${providerId}#provider-${providerId}` : ""}`
            : undefined
        }
        size={size}
        title={!canConnect ? copy.connectRestricted : undefined}
        variant="outline"
      >
        {label}
      </Button>
    </div>
  );
}
