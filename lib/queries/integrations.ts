import "server-only";

import { prisma } from "@/lib/db/prisma";
import { isSelfHost } from "@/lib/deployment/deployment";
import { centsToDollars } from "@/lib/format/currency";
import {
  type ActiveIntegrationKind,
  INTEGRATION_CATEGORY_COPY,
} from "@/lib/integrations/category-copy";
import { providerCredentialFieldsFor } from "@/lib/integrations/credential-fields";
import { providerIcon } from "@/lib/integrations/provider-icon";
import { readableProviderIdentity } from "@/lib/integrations/provider-identity";
import { COST_ESTIMATE_PER_CHECK_HELP } from "@/lib/integrations/settings-copy";
import type {
  GoogleOAuthSetup,
  IntegrationCategoryData as IntegrationCategory,
  IntegrationProviderData as IntegrationProvider,
} from "@/lib/integrations/types";
import { loadRecentProviderRateEntries } from "@/lib/provider-rates/connection-context";
import { PROVIDER_RATE_FEATURES } from "@/lib/provider-rates/resolver";
import { PROVIDER_CATALOG, tintFor } from "@/lib/providers/registry";
import {
  compareProviderChainEntries,
  primaryProviderConnection,
  providerChainOrderBy,
} from "@/lib/rank-check/provider-chain-order";
import { DEFAULT_SERP_DEPTH, DEFAULT_SERP_MARKET } from "@/lib/serp/markets";
import type { StatusKind } from "@/lib/ui/status-kind";
import { requireReadableProject } from "./_auth";
import {
  displayedProviderLogin,
  type ProviderConnectionRow,
  type ProviderCostEntryRow,
  providerActivities,
  providerDescription,
  providerMeta,
  providerRates,
} from "./integration-provider-drawer";

type SyncFailure = NonNullable<IntegrationProvider["syncFailure"]>;

export type IntegrationsView = {
  categories: IntegrationCategory[];
  connectionCount: number;
};

const activeIntegrationKinds = [
  "serp",
  "analytics",
] as const satisfies readonly ActiveIntegrationKind[];

function statusFor(itemStatus: StatusKind, connection?: ProviderConnectionRow) {
  return connection?.status ?? itemStatus;
}

function compareConnection(a: ProviderConnectionRow, b: ProviderConnectionRow) {
  const enabledDelta = Number(b.enabled) - Number(a.enabled);
  return enabledDelta || compareProviderChainEntries(a, b);
}

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

function integrationProvider(
  kind: ActiveIntegrationKind,
  row: ReturnType<typeof orderedCatalog>[number],
  now: Date,
  primaryProvider: string | null,
  googleOAuth?: GoogleOAuthSetup,
  syncFailure?: SyncFailure,
  costEntries: readonly ProviderCostEntryRow[] = [],
): IntegrationProvider {
  const { connection, item } = row;
  const cost = connection?.costPerCheckCents;
  const primary = connection?.provider === primaryProvider;
  const connected = connection?.status === "connected";
  // Only the non-secret identity fields (login, endpoint) may reach the client;
  // password and apiKey stay server-side and are kept out of drawer defaults.
  const identity = readableProviderIdentity(connection?.credentialsEncrypted);
  const credentials =
    identity.state === "readable" ? { endpoint: identity.endpoint, login: identity.login } : {};
  const displayedLogin = displayedProviderLogin(item.id, credentials.login);

  return {
    credentialIssue: identity.state === "unreadable" ? "unreadable" : undefined,
    description: providerDescription(item),
    drawer: {
      activities: providerActivities(kind, connection, now),
      costHelp: COST_ESTIMATE_PER_CHECK_HELP,
      credentialFields: providerCredentialFieldsFor(item.id, { connected }),
      defaults: {
        costPerCheck: cost == null ? undefined : centsToDollars(Number(cost)),
        depth: `Top ${DEFAULT_SERP_DEPTH}`,
        device: "Desktop",
        endpoint: credentials.endpoint ?? "",
        language: "English",
        location: DEFAULT_SERP_MARKET,
        login: displayedLogin ?? "",
        secret: "",
      },
      envHint:
        isSelfHost && item.id !== "local-sequence"
          ? "Credentials can also be configured through environment variables."
          : undefined,
      googleOAuth: item.id === (googleOAuth?.provider ?? "gsc") ? googleOAuth : undefined,
      rates: item.kind === "serp" ? providerRates(connection, item.id, costEntries) : undefined,
    },
    enabled: connection?.enabled,
    icon: providerIcon(item.id, item.kind),
    id: item.id,
    kind,
    logoDomain: item.logoDomain,
    meta: providerMeta(item, connection, { ...credentials, login: displayedLogin }, now),
    name: item.label,
    neverSynced:
      kind === "analytics" &&
      connected &&
      connection.enabled &&
      connection.lastUsedAt === null &&
      !syncFailure
        ? true
        : undefined,
    primary: primary || undefined,
    priority: connection?.priority,
    secondaryAction: connection?.status === "connected" ? "Test" : undefined,
    status: statusFor(item.defaultStatus, connection),
    syncFailure: connection?.status === "needs_reauth" ? undefined : syncFailure,
    tint: `var(--${tintFor(item.id)})`,
  };
}

async function loadProviderConnections(projectId: string) {
  return prisma.providerConnection.findMany({
    include: {
      rates: {
        select: { amountCents: true, feature: true },
      },
    },
    orderBy: providerChainOrderBy(),
    where: { projectId },
  }) as Promise<ProviderConnectionRow[]>;
}

async function categoriesForProject(
  projectId: string,
  now: Date,
  googleOAuth?: GoogleOAuthSetup,
): Promise<IntegrationCategory[]> {
  const connections = await loadProviderConnections(projectId);
  const [runs, costEntries] = await Promise.all([
    prisma.operationalRun.findMany({
      orderBy: { startedAt: "desc" },
      select: { connectionId: true, errorClass: true, startedAt: true, status: true },
      where: { kind: "traffic_sync", projectId },
    }),
    loadRecentProviderRateEntries(
      connections.map((connection) => connection.id),
      PROVIDER_RATE_FEATURES,
      new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    ) as Promise<ProviderCostEntryRow[]>,
  ]);
  const failuresByConnection = new Map<string, SyncFailure>();
  for (const connection of connections) {
    if (connection.kind !== "analytics") continue;
    const connectionRuns = runs.filter((run) => run.connectionId === connection.id);
    if (connectionRuns[0]?.status !== "failed") continue;
    const firstNonFailure = connectionRuns.findIndex((run) => run.status !== "failed");
    const failedRuns =
      firstNonFailure === -1 ? connectionRuns : connectionRuns.slice(0, firstNonFailure);
    const oldest = failedRuns.at(-1);
    if (!oldest) continue;
    failuresByConnection.set(connection.id, {
      consecutiveFailures: failedRuns.length,
      errorClass: connectionRuns[0]?.errorClass ?? "unknown",
      since: oldest.startedAt.toISOString(),
    });
  }
  const dataCategories = activeIntegrationKinds.map((kind) => {
    const copy = INTEGRATION_CATEGORY_COPY[kind];
    const primaryProvider = primaryProviderConnection(connections, kind)?.provider ?? null;
    return {
      description: copy.description,
      eyebrow: copy.eyebrow,
      id: kind,
      providers: orderedCatalog(kind, connections).map((row) =>
        integrationProvider(
          kind,
          row,
          now,
          primaryProvider,
          googleOAuth,
          row.connection ? failuresByConnection.get(row.connection.id) : undefined,
          costEntries,
        ),
      ),
      title: copy.title,
    };
  });

  return dataCategories;
}

export async function getIntegrationsView(
  projectId: string,
  options: { googleOAuth?: GoogleOAuthSetup; now?: Date } = {},
): Promise<IntegrationsView> {
  const { project } = await requireReadableProject(projectId);
  const now = options.now ?? new Date();
  const [connectionCount, categories] = await Promise.all([
    prisma.providerConnection.count({
      where: { projectId: project.id, status: "connected" },
    }),
    categoriesForProject(project.id, now, options.googleOAuth),
  ]);

  return { categories, connectionCount };
}

export async function getIntegrationCategories(
  projectId: string,
  options: { googleOAuth?: GoogleOAuthSetup; now?: Date } = {},
): Promise<IntegrationCategory[]> {
  const { project } = await requireReadableProject(projectId);
  return categoriesForProject(project.id, options.now ?? new Date(), options.googleOAuth);
}

export async function isProviderConnected(projectId: string, provider: string) {
  const { project } = await requireReadableProject(projectId);
  const connection = await prisma.providerConnection.findUnique({
    select: { enabled: true, status: true },
    where: { projectId_provider: { projectId: project.id, provider } },
  });

  return Boolean(connection?.enabled && connection.status === "connected");
}
