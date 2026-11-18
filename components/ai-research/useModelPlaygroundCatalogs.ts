"use client";
import {
  type ModelPlaygroundCatalogLoader,
  modelPlaygroundCatalogRequestSchema,
} from "@/lib/model-playground/catalog-request";
import { connectionReadiness, type ModelConnection } from "@/lib/model-playground/composer-state";
import { scheduleComposerExpiry } from "@/lib/model-playground/composer-timer";
import type { ModelCatalogSnapshot } from "@/lib/providers/model/types";
import { type SetStateAction, useCallback, useEffect, useMemo, useState } from "react";

type CatalogState = {
  source: readonly ModelCatalogSnapshot[];
  value: readonly ModelCatalogSnapshot[];
  connections: readonly ModelConnection[];
};

function refreshedCatalogs(
  local: CatalogState,
  source: CatalogState["source"],
  connections: CatalogState["connections"],
) {
  if (local.source === source && local.connections === connections) return local.value;
  const scoped = local.value.filter((catalog) => {
    const sameProvider = (item: ModelCatalogSnapshot) => item.providerId === catalog.providerId;
    if (
      !catalog.workspaceId ||
      source.some((item) => sameProvider(item) && item.workspaceId === catalog.workspaceId)
    )
      return false;
    const connection = connections.find((item) => item.id === catalog.providerId);
    const previous = local.connections.find((item) => item.id === catalog.providerId);
    const defaultCatalog = (item: ModelCatalogSnapshot) => sameProvider(item) && !item.workspaceId;
    const scope = source.find(defaultCatalog)?.accountDigest;
    return (
      connectionReadiness(connection) === "connected" &&
      connection?.connectionId === previous?.connectionId &&
      scope !== undefined &&
      scope === local.source.find(defaultCatalog)?.accountDigest
    );
  });
  return scoped.length ? [...source, ...scoped] : source;
}

/** Refresh free metadata at expiry, without resetting the user's draft or retrying failed reads. */
export function useModelPlaygroundCatalogs(
  source: readonly ModelCatalogSnapshot[],
  connections: readonly ModelConnection[],
  loadCatalog?: ModelPlaygroundCatalogLoader,
) {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const refreshCatalogs = useCallback(() => setRefreshVersion((value) => value + 1), []);
  const [local, setLocal] = useState({ source, value: source, connections });
  const catalogs = useMemo(
    () => refreshedCatalogs(local, source, connections),
    [local, source, connections],
  );
  const setCatalogs = useCallback(
    (update: SetStateAction<readonly ModelCatalogSnapshot[]>) => {
      setLocal((current) => {
        const value = refreshedCatalogs(current, source, connections);
        return {
          source,
          connections,
          value: typeof update === "function" ? update(value) : update,
        };
      });
    },
    [source, connections],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: Explicit retry re-arms the expired-catalog effect after a failed metadata read.
  useEffect(() => {
    if (!loadCatalog) return;
    const eligible = catalogs.flatMap((catalog) => {
      const connection = connections.find((item) => item.id === catalog.providerId);
      const request = modelPlaygroundCatalogRequestSchema.safeParse({
        providerId: catalog.providerId,
        connectionId: connection?.connectionId,
        ...(catalog.workspaceId ? { workspaceId: catalog.workspaceId } : {}),
      });
      return connectionReadiness(connection) === "connected" && request.success
        ? [{ catalog, request: request.data }]
        : [];
    });
    const expiry = Math.min(...eligible.map(({ catalog }) => Date.parse(catalog.expiresAt)));
    const controller = new AbortController();
    const cancel = scheduleComposerExpiry(expiry, () => {
      void Promise.all(
        eligible
          .filter(({ catalog }) => Date.parse(catalog.expiresAt) <= Date.now())
          .map(async ({ request }) => {
            try {
              const loaded = await loadCatalog(request, controller.signal);
              if (controller.signal.aborted || Date.parse(loaded.expiresAt) <= Date.now())
                return null;
              return loaded;
            } catch {
              // Leave the expired catalog fenced; a failed metadata read never permits a run.
              return null;
            }
          }),
      ).then((results) => {
        const fresh = results.filter(
          (catalog): catalog is ModelCatalogSnapshot => catalog !== null,
        );
        if (!controller.signal.aborted && fresh.length)
          setCatalogs((current) => [
            ...current.filter(
              (catalog) =>
                !fresh.some(
                  (next) =>
                    next.providerId === catalog.providerId &&
                    next.workspaceId === catalog.workspaceId,
                ),
            ),
            ...fresh,
          ]);
      });
    });
    return () => {
      cancel();
      controller.abort();
    };
  }, [catalogs, connections, loadCatalog, setCatalogs, refreshVersion]);
  return { catalogs, setCatalogs, refreshCatalogs };
}
