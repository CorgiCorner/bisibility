import "server-only";

import { prisma } from "@/lib/db/prisma";
import { centsToDollars } from "@/lib/format/currency";
import {
  type ActiveIntegrationKind,
  INTEGRATION_CATEGORY_COPY,
} from "@/lib/integrations/category-copy";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import type { ProviderKind, ProviderStatus } from "@/lib/providers/types";
import {
  compareProviderChainEntries,
  primaryProviderConnection,
  providerChainOrderBy,
} from "@/lib/rank-check/provider-chain-order";
import { requireApiPublicId } from "./public-id";

type ProviderConnectionRow = {
  costPerCheckCents: unknown;
  enabled: boolean;
  kind: ProviderKind;
  lastUsedAt: Date | null;
  priority: number;
  provider: string;
  publicId: string | null;
  status: ProviderStatus;
  updatedAt: Date;
};

function ageLabel(date: Date | null | undefined) {
  if (!date) return "Never";
  const hours = Math.max(0, Math.floor((Date.now() - date.getTime()) / 3_600_000));
  return hours < 1 ? "Just now" : `${hours}h ago`;
}

function costLabel(cost: unknown, kind: ProviderKind) {
  if (cost == null) return kind === "serp" ? "Not set" : "Your provider account";
  return `$${centsToDollars(Number(cost)).toFixed(4)} / check`;
}

function compareConnection(a: ProviderConnectionRow, b: ProviderConnectionRow) {
  return Number(b.enabled) - Number(a.enabled) || compareProviderChainEntries(a, b);
}

const activeIntegrationKinds = [
  "serp",
  "analytics",
] as const satisfies readonly ActiveIntegrationKind[];

function orderedCatalog(kind: ActiveIntegrationKind, connections: ProviderConnectionRow[]) {
  const connectedIds = new Set(
    connections.filter((row) => row.kind === kind).map((row) => row.provider),
  );
  const connectedCatalog = connections
    .filter((row) => row.kind === kind)
    .sort(compareConnection)
    .flatMap((row) => {
      const item = PROVIDER_CATALOG.find((provider) => provider.id === row.provider);
      return item ? [{ connection: row, item }] : [];
    });
  const remainingCatalog = PROVIDER_CATALOG.filter(
    (item) => item.kind === kind && !connectedIds.has(item.id),
  ).map((item) => ({ connection: undefined, item }));

  return [...connectedCatalog, ...remainingCatalog];
}

function providerMeta(kind: ProviderKind, connection?: ProviderConnectionRow) {
  let state = "Ready";
  if (connection) state = connection.enabled ? "Enabled" : "Disabled";
  return [
    {
      label: kind === "serp" ? "Last rank check" : "Last sync",
      value: ageLabel(connection?.lastUsedAt),
    },
    {
      label: kind === "serp" ? "Fallback priority" : "Priority",
      value: connection ? String(connection.priority) : "Not connected",
    },
    {
      label: kind === "serp" ? "Est. provider cost" : "Billing",
      value: costLabel(connection?.costPerCheckCents, kind),
    },
    {
      label: "State",
      value: state,
    },
  ];
}

function providerResource(
  kind: ActiveIntegrationKind,
  row: ReturnType<typeof orderedCatalog>[number],
  primaryProvider: string | null,
) {
  const { connection, item } = row;
  return {
    connectionId: connection ? requireApiPublicId(connection.publicId ?? "", "conn") : undefined,
    enabled: connection?.enabled,
    id: item.id,
    kind,
    logoDomain: item.logoDomain,
    meta: providerMeta(kind, connection),
    name: item.label,
    primary: connection?.provider === primaryProvider || undefined,
    priority: connection?.priority,
    status: connection?.status ?? item.defaultStatus,
  };
}

async function loadProviderConnections(projectId: string) {
  return prisma.providerConnection.findMany({
    orderBy: providerChainOrderBy(),
    where: { projectId },
  }) as Promise<ProviderConnectionRow[]>;
}

export async function listProviderCategories(projectId: string) {
  const connections = await loadProviderConnections(projectId);
  return activeIntegrationKinds.map((kind) => {
    const copy = INTEGRATION_CATEGORY_COPY[kind];
    return {
      description: copy.description,
      eyebrow: copy.eyebrow,
      id: kind,
      providers: orderedCatalog(kind, connections).map((row) =>
        providerResource(kind, row, primaryProviderConnection(connections, kind)?.provider ?? null),
      ),
      title: copy.title,
    };
  });
}
