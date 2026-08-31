import "server-only";

import { verifyProviderConnectionBeforeSave } from "@/lib/api/provider-verification";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import type { GoogleOAuthSetup, GooglePropertySaveResult } from "@/lib/integrations/types";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { decryptProviderCredentials, encryptSecret } from "@/lib/providers/crypto";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import type { ProviderCredentials } from "@/lib/providers/types";
import { dateKey } from "@/lib/search-insights/dates";
import { searchInsightsPropertyKey } from "@/lib/search-insights/keys";
import { queueSearchInsightsImport } from "@/lib/search-insights/sync/ensure-import";
import {
  type GoogleProviderId,
  listGa4Properties,
  listGoogleSites,
  refreshGoogleAccessToken,
} from "./google-client";
import { ga4PropertyOptions, gscPropertyOptions } from "./google-property-options";
import { normalizeGa4PropertyId } from "./property-id";

type StoredConnection = {
  credentialsEncrypted: string | null;
  id: string;
  publicId: string | null;
};

type StoredPropertyContext = {
  actorId: string;
  projectId: string;
  provider: GoogleProviderId;
};

const reconnectMessage = "Reconnect the Google account to load its properties.";

function reconnectSetup(provider: GoogleProviderId): GoogleOAuthSetup {
  return { error: reconnectMessage, properties: [], provider, requiresReauth: true };
}

function readCredentials(connection: StoredConnection | null): ProviderCredentials | null {
  try {
    const credentials = decryptProviderCredentials(connection?.credentialsEncrypted);
    return credentials.apiKey ? credentials : null;
  } catch {
    return null;
  }
}

function providerDefinition(provider: GoogleProviderId) {
  const definition = PROVIDER_CATALOG.find((item) => item.id === provider);
  if (!definition) throw new Error("Analytics provider is unavailable.");
  return definition;
}

async function listProperties(provider: GoogleProviderId, accessToken: string) {
  return provider === "ga4"
    ? ga4PropertyOptions(await listGa4Properties(accessToken))
    : gscPropertyOptions(await listGoogleSites(accessToken));
}

function selectedProperty(
  provider: GoogleProviderId,
  requestedProperty: string,
  properties: GoogleOAuthSetup["properties"],
) {
  const property =
    provider === "ga4"
      ? normalizeGa4PropertyId(requestedProperty)
      : { ok: true as const, value: requestedProperty.trim() };
  if (!property.ok) throw new Error(property.error.message);
  const selected = properties.find((option) => option.value === property.value);
  if (!selected) {
    throw new Error("Select a property returned by the connected account.");
  }
  return selected;
}

async function storedGscContext(projectId: string) {
  const [project, rows] = await Promise.all([
    prisma.project?.findUnique?.({ select: { domain: true }, where: { id: projectId } }) ??
      Promise.resolve(null),
    prisma.searchInsightsPropertyRegistry?.findMany?.({
      select: { propertyKey: true },
      where: { projectId, status: "archived" },
    }) ?? Promise.resolve([]),
  ]);
  const archivedProperties = await Promise.all(
    rows.map(async (row) => {
      const partition = await prisma.searchAnalyticsSyncPartition.findFirst({
        orderBy: { date: "desc" },
        select: { date: true },
        where: { projectId, property: row.propertyKey, source: "gsc" },
      });
      if (!partition) return null;
      const kind = row.propertyKey.startsWith("sc-domain:") ? "domain" : "url-prefix";
      return {
        kind,
        label: row.propertyKey.startsWith("sc-domain:")
          ? row.propertyKey.slice("sc-domain:".length)
          : row.propertyKey,
        lastSyncedDate: dateKey(partition.date),
        permissionLevel: "",
        value: row.propertyKey,
      } as const;
    }),
  );
  return {
    archivedProperties: archivedProperties.filter((property) => property !== null),
    projectDomain: project?.domain ?? "",
  };
}

async function storedConnection(projectId: string, provider: GoogleProviderId) {
  return prisma.providerConnection.findUnique({
    select: { credentialsEncrypted: true, id: true, publicId: true },
    where: { projectId_provider: { projectId, provider } },
  });
}

export async function loadStoredGoogleProperties(
  context: Omit<StoredPropertyContext, "actorId">,
): Promise<GoogleOAuthSetup> {
  const connection = await storedConnection(context.projectId, context.provider);
  const credentials = readCredentials(connection);
  if (!credentials?.apiKey) return reconnectSetup(context.provider);

  try {
    const accessToken = await refreshGoogleAccessToken(credentials.apiKey);
    const gscContext = context.provider === "gsc" ? await storedGscContext(context.projectId) : {};
    return {
      ...gscContext,
      ...(credentials.accountEmail ? { accountEmail: credentials.accountEmail } : {}),
      preferredProperty: credentials.login,
      properties: await listProperties(context.provider, accessToken),
      provider: context.provider,
    };
  } catch (error) {
    if (error instanceof ProviderAuthError) return reconnectSetup(context.provider);
    return {
      error: "Properties could not be loaded. Try again or reconnect the account.",
      preferredProperty: credentials.login,
      properties: [],
      provider: context.provider,
    };
  }
}

export async function saveStoredGoogleProperty(
  context: StoredPropertyContext & { property: string },
): Promise<GooglePropertySaveResult> {
  const connection = await storedConnection(context.projectId, context.provider);
  const credentials = readCredentials(connection);
  if (!connection || !credentials?.apiKey) return { status: "reauth_required" };

  let properties: GoogleOAuthSetup["properties"];
  try {
    const accessToken = await refreshGoogleAccessToken(credentials.apiKey);
    properties = await listProperties(context.provider, accessToken);
  } catch (error) {
    if (error instanceof ProviderAuthError) return { status: "reauth_required" };
    throw new Error("Properties could not be verified. Try again.");
  }

  const selected = selectedProperty(context.provider, context.property, properties);
  const updatedCredentials = { ...credentials, login: selected.value };
  try {
    await verifyProviderConnectionBeforeSave({
      credentials: updatedCredentials,
      hasStoredCredentials: true,
      projectId: context.projectId,
      provider: providerDefinition(context.provider),
    });
  } catch {
    throw new Error("The selected property could not be verified. Choose another property.");
  }

  await prisma.$transaction(async (tx) => {
    await lockProjectForProviderMutation(tx, context.projectId);
    const current = await tx.providerConnection.findUnique({
      select: { credentialsEncrypted: true, id: true, publicId: true },
      where: {
        projectId_provider: { projectId: context.projectId, provider: context.provider },
      },
    });
    if (!current || current.credentialsEncrypted !== connection.credentialsEncrypted) {
      throw new Error("The connection changed. Load properties again.");
    }
    await tx.providerConnection.update({
      data: {
        credentialsEncrypted: encryptSecret(JSON.stringify(updatedCredentials)),
        status: "connected",
      },
      where: { id: current.id },
    });
    if (context.provider === "gsc") {
      const ga4Connection = await tx.providerConnection.findUnique({
        select: { credentialsEncrypted: true, id: true, publicId: true },
        where: { projectId_provider: { projectId: context.projectId, provider: "ga4" } },
      });
      const ga4Credentials = readCredentials(ga4Connection);
      const normalizedGa4 = normalizeGa4PropertyId(ga4Credentials?.login ?? "");
      const ga4PropertyId = normalizedGa4.ok ? normalizedGa4.value : null;
      const now = new Date();
      await tx.searchInsightsPropertyRegistry.updateMany({
        data: { archivedAt: now, status: "archived" },
        where: { projectId: context.projectId, status: "active" },
      });
      const previousProperty = searchInsightsPropertyKey(credentials.login ?? "");
      if (previousProperty && previousProperty !== selected.value) {
        await tx.searchInsightsPropertyRegistry.upsert({
          create: {
            archivedAt: now,
            projectId: context.projectId,
            propertyKey: previousProperty,
            status: "archived",
          },
          update: { archivedAt: now, status: "archived" },
          where: {
            projectId_propertyKey: { projectId: context.projectId, propertyKey: previousProperty },
          },
        });
      }
      await tx.searchInsightsPropertyRegistry.upsert({
        create: {
          ga4PropertyId,
          projectId: context.projectId,
          propertyKey: selected.value,
          status: "active",
        },
        update: { activatedAt: now, archivedAt: null, ga4PropertyId, status: "active" },
        where: {
          projectId_propertyKey: { projectId: context.projectId, propertyKey: selected.value },
        },
      });
    }
    await writeAudit(
      {
        action: "provider.update",
        actorId: context.actorId,
        after: {
          hasCredentials: true,
          permissionLevel: selected.permissionLevel,
          property: selected.value,
          provider: context.provider,
        },
        before: {
          hasCredentials: Boolean(current.credentialsEncrypted),
          property: readCredentials(current)?.login ?? null,
          provider: context.provider,
        },
        projectId: context.projectId,
        targetId: requiredPublicAuditId(current.publicId, "conn", "Provider connection"),
        targetType: "provider_connection",
      },
      tx,
    );
  });

  if (context.provider === "gsc" || context.provider === "ga4") {
    await queueSearchInsightsImport({
      projectId: context.projectId,
      property: selected.value,
      source: context.provider,
    });
  }

  return { property: selected.value, status: "saved" };
}
