import "server-only";

import { verifyProviderConnectionBeforeSave } from "@/lib/api/provider-verification";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import type { GoogleOAuthSetup, GooglePropertySaveResult } from "@/lib/integrations/types";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { decryptProviderCredentials, encryptSecret } from "@/lib/providers/crypto";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import type { ProviderCredentials } from "@/lib/providers/types";
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
    return {
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
    const current = await tx.providerConnection.findUnique({
      select: { credentialsEncrypted: true, publicId: true },
      where: { id: connection.id },
    });
    if (!current || current.credentialsEncrypted !== connection.credentialsEncrypted) {
      throw new Error("The connection changed. Load properties again.");
    }
    await tx.providerConnection.update({
      data: {
        credentialsEncrypted: encryptSecret(JSON.stringify(updatedCredentials)),
        status: "connected",
      },
      where: { id: connection.id },
    });
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
          hasCredentials: Boolean(connection.credentialsEncrypted),
          property: credentials.login ?? null,
          provider: context.provider,
        },
        projectId: context.projectId,
        targetId: requiredPublicAuditId(current.publicId, "conn", "Provider connection"),
        targetType: "provider_connection",
      },
      tx,
    );
  });

  return { property: selected.value, status: "saved" };
}
