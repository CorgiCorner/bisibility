import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { decryptProviderCredentials } from "@/lib/providers/crypto";
import { modelAccountDigest } from "@/lib/providers/model/account-scope";
import { ModelCatalogCache } from "@/lib/providers/model/catalog-cache";
import { getModelProvider } from "@/lib/providers/model/registry";
import { consumeProviderLimit } from "@/lib/providers/rate-limit";
import type { ModelPaymentDatabase } from "./admission-storage";
import "@/lib/providers/model/server-registration";
import type { ProviderRequestSource } from "@/lib/provider-usage/tag";
import type { ModelCatalogSnapshot } from "@/lib/providers/model/types";
import {
  type ModelPlaygroundCatalogRequest,
  modelPlaygroundCatalogRequestSchema,
} from "./catalog-request";
import {
  peekModelFundingCatalog,
  recheckModelFundingConnection,
  resolveModelFundingConnection,
} from "./funding-extension";
import { ModelAdmissionRefusal } from "./payment";
import type { ModelConnectionResolution } from "./runtime-contract";

export type { ModelConnectionResolution } from "./runtime-contract";

type ConnectionRow = {
  id: string;
  provider: string;
  kind: string;
  credentialSource: string;
  enabled: boolean;
  status: string;
  credentialsEncrypted: string | null;
};
const cache = new ModelCatalogCache();

/** Readiness never decrypts credentials or loads a provider catalog. */
export async function checkModelConnection(
  db: ModelPaymentDatabase,
  projectId: string,
  input: ModelPlaygroundCatalogRequest,
) {
  const request = modelPlaygroundCatalogRequestSchema.parse(input);
  const [row] = await db.$transaction(
    (tx) => tx.$queryRaw<ConnectionRow[]>`
    SELECT id,provider,kind,"credentialSource",enabled,status,"credentialsEncrypted"
    FROM provider_connections WHERE "projectId"=${projectId} AND "publicId"=${request.connectionId}`,
  );
  if (
    !row ||
    row.provider !== request.providerId ||
    row.kind !== "model" ||
    row.credentialSource !== "own" ||
    !row.credentialsEncrypted ||
    !row.enabled ||
    row.status !== "connected"
  )
    throw new ModelAdmissionRefusal("connection_unavailable");
  return row;
}

async function connectionScope(
  db: ModelPaymentDatabase,
  projectId: string,
  input: ModelPlaygroundCatalogRequest,
) {
  const request = modelPlaygroundCatalogRequestSchema.parse(input);
  const row = await checkModelConnection(db, projectId, request);
  const credentialVersion = ownCredentialVersion(row.provider, row.id, row.credentialsEncrypted);
  let apiKey: string | undefined;
  try {
    apiKey = decryptProviderCredentials(row.credentialsEncrypted).apiKey;
  } catch {
    /* Refuse unreadable keys. */
  }
  if (!apiKey || !credentialVersion) throw new ModelAdmissionRefusal("credential_changed");
  const accountDigest = modelAccountDigest(request.providerId, apiKey, request.workspaceId);
  const scope = {
    providerId: request.providerId,
    accountDigest,
    credentialRevision: credentialVersion,
    ...(request.workspaceId ? { workspaceId: request.workspaceId } : {}),
  };
  return { request, row, credentialVersion, apiKey, accountDigest, scope };
}

/** Resolve only the selected project-owned key. Never expose this value to the browser. */
export async function resolveModelConnection(
  db: ModelPaymentDatabase,
  projectId: string,
  input: ModelPlaygroundCatalogRequest,
  options: { cache?: ModelCatalogCache; actorId?: string; source?: ProviderRequestSource } = {},
): Promise<ModelConnectionResolution> {
  if (input.connectionId.startsWith("platform:"))
    return resolveModelFundingConnection(db, projectId, input, options);
  const { request, row, credentialVersion, apiKey, accountDigest, scope } = await connectionScope(
    db,
    projectId,
    input,
  );
  const signal = AbortSignal.timeout(15_000);
  const adapter = await getModelProvider(request.providerId, signal);
  if (!adapter) throw new ModelAdmissionRefusal("connection_unavailable");
  const catalogCache = options.cache ?? cache;
  let catalog = catalogCache.get(scope);
  if (!catalog) {
    const gate = await consumeProviderLimit(request.providerId, { apiKey }, { projectId });
    if (!gate.success) throw new ModelAdmissionRefusal("connection_unavailable");
    const result = await adapter.probe({
      apiKey,
      accountDigest,
      signal,
      ...(request.workspaceId ? { workspaceId: request.workspaceId } : {}),
    });
    if (result.state !== "catalog_available") throw new ModelAdmissionRefusal("catalog_changed");
    catalogCache.set(scope, result.catalog);
    catalog = catalogCache.get(scope);
  }
  if (!catalog) throw new ModelAdmissionRefusal("catalog_changed");
  return { id: row.id, credentialVersion, accountDigest, apiKey, adapter, catalog };
}

/** Cached catalog only: never loads an adapter, consumes provider quota or calls the provider.
 * A cache miss returns null, and the caller reports the cost as unknown. */
export async function peekModelCatalog(
  db: ModelPaymentDatabase,
  projectId: string,
  input: ModelPlaygroundCatalogRequest,
  options: { cache?: ModelCatalogCache; actorId?: string; source?: ProviderRequestSource } = {},
): Promise<ModelCatalogSnapshot | null> {
  if (input.connectionId.startsWith("platform:"))
    return peekModelFundingCatalog(db, projectId, input, options);
  const { scope } = await connectionScope(db, projectId, input);
  return (options.cache ?? cache).get(scope) ?? null;
}

/** Only row reads under admission locks; catalog I/O already finished outside the transaction. */
export async function recheckModelConnection(
  tx: Prisma.TransactionClient,
  projectId: string,
  request: ModelPlaygroundCatalogRequest,
  resolved: ModelConnectionResolution,
  actorId?: string,
  source?: ProviderRequestSource,
) {
  if (resolved.fundingSource === "platform")
    return recheckModelFundingConnection(tx, projectId, request, resolved, actorId, source);
  const [row] = await tx.$queryRaw<ConnectionRow[]>`
    SELECT id,provider,kind,"credentialSource",enabled,status,"credentialsEncrypted"
    FROM provider_connections WHERE "projectId"=${projectId} AND "publicId"=${request.connectionId} FOR SHARE`;
  if (
    !row ||
    row.id !== resolved.id ||
    row.provider !== request.providerId ||
    row.kind !== "model" ||
    row.credentialSource !== "own" ||
    !row.enabled ||
    row.status !== "connected"
  )
    throw new ModelAdmissionRefusal("connection_unavailable");
  if (
    ownCredentialVersion(row.provider, row.id, row.credentialsEncrypted) !==
    resolved.credentialVersion
  )
    throw new ModelAdmissionRefusal("credential_changed");
}
