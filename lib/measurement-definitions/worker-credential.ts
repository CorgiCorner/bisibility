import "server-only";
import { DefinitionUnavailableError } from "./errors";
import type { DefinitionTransaction } from "./model";

type RunCredential = {
  credentialKind: string | null;
  credentialId: string | null;
  requestedById: string | null;
};
const writable = (scopes: readonly string[]) =>
  scopes.includes("write") || scopes.includes("admin");

/** Reauthorize the original stored credential, never a credential or role from request JSON. */
export async function assertDefinitionRunCredential(
  tx: DefinitionTransaction,
  projectId: string,
  run: RunCredential,
) {
  if (run.credentialKind === null && run.credentialId === null) return;
  if (!run.credentialId || !run.credentialKind) throw new DefinitionUnavailableError();
  const now = new Date();
  if (run.credentialKind === "project_key") {
    if (run.requestedById !== null) throw new DefinitionUnavailableError();
    await tx.$queryRaw`SELECT id FROM api_keys WHERE id=${run.credentialId} FOR SHARE`;
    const key = await tx.apiKey.findFirst({
      where: { id: run.credentialId, projectId },
      select: { scopes: true, revokedAt: true, expiresAt: true },
    });
    if (!key || key.revokedAt || (key.expiresAt && key.expiresAt <= now) || !writable(key.scopes))
      throw new DefinitionUnavailableError();
    return;
  }
  if (!run.requestedById) throw new DefinitionUnavailableError();
  if (run.credentialKind === "personal_token") {
    await tx.$queryRaw`SELECT id FROM personal_access_tokens WHERE id=${run.credentialId} FOR SHARE`;
    const token = await tx.personalAccessToken.findFirst({
      where: { id: run.credentialId, userId: run.requestedById },
      select: { scopes: true, revokedAt: true, expiresAt: true },
    });
    if (
      !token ||
      token.revokedAt ||
      (token.expiresAt && token.expiresAt <= now) ||
      !writable(token.scopes)
    )
      throw new DefinitionUnavailableError();
    return;
  }
  if (run.credentialKind === "oauth_client") {
    await tx.$queryRaw`SELECT id FROM "oauthClient" WHERE "clientId"=${run.credentialId} FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM "oauthConsentV2" WHERE "clientId"=${run.credentialId} AND "userId"=${run.requestedById} FOR SHARE`;
    const client = await tx.oauthClient.findUnique({
      where: { clientId: run.credentialId },
      select: { disabled: true, scopes: true },
    });
    const consent = await tx.oauthConsent.findFirst({
      where: { clientId: run.credentialId, userId: run.requestedById },
      select: { scopes: true },
    });
    if (
      !client ||
      client.disabled ||
      !consent ||
      !writable(client.scopes) ||
      !writable(consent.scopes)
    )
      throw new DefinitionUnavailableError();
    return;
  }
  throw new DefinitionUnavailableError();
}
