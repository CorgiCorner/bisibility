import "server-only";
import { grantedApiScopes, hasApiScope, parseStoredApiScopes } from "@/lib/api/scope-policy";
import { AuthorizationError } from "@/lib/auth/authorize";
import type { RankReportContext } from "@/lib/rank-reports/access";
import { snapshotRankReportContext } from "@/lib/rank-reports/access";
import type { RetainedCredentialReadPort } from "./retained-credential-port";

export type HistoryExportAuthority = RankReportContext & {
  credential?: { kind: "project_key" | "personal_token" | "oauth_client"; id: string };
};
export function snapshotHistoryExportAuthority(
  context: HistoryExportAuthority,
): HistoryExportAuthority {
  return {
    ...snapshotRankReportContext(context),
    ...(context.credential ? { credential: { ...context.credential } } : {}),
  };
}
function canReadOAuth(scopes: unknown) {
  return (
    Array.isArray(scopes) &&
    scopes.every((scope) => typeof scope === "string") &&
    hasApiScope(grantedApiScopes(scopes), "read")
  );
}
const deny = () => {
  throw new AuthorizationError("forbidden");
};
function canRead(scopes: unknown) {
  const parsed = parseStoredApiScopes(scopes);
  return parsed !== null && hasApiScope(parsed, "read");
}
/** The API/session adapter is trusted; JSON can never set this authority object. */
export async function assertHistoryExportCredential(
  tx: RetainedCredentialReadPort,
  context: HistoryExportAuthority,
  project: { id: string; publicId: string },
  now = new Date(),
) {
  if (context.transport === "session") {
    if (context.credential) deny();
    return; // Fresh user and membership are checked by authorizeRankReportScope in this transaction.
  }
  const credential = context.credential;
  if (!credential || credential.id !== context.credentialId) return deny();
  if (context.transport === "project_key") {
    if (credential.kind !== "project_key") return deny();
    const key = await tx.apiKey.findFirst({
      where: { id: credential.id, projectId: project.id },
      select: { revokedAt: true, expiresAt: true, scopes: true },
    });
    if (!key || key.revokedAt || (key.expiresAt && key.expiresAt <= now) || !canRead(key.scopes))
      deny();
    return;
  }
  if (credential.kind === "personal_token") {
    const token = await tx.personalAccessToken.findFirst({
      where: { id: credential.id, userId: context.actor.id },
      select: { revokedAt: true, expiresAt: true, scopes: true },
    });
    if (
      !token ||
      token.revokedAt ||
      (token.expiresAt && token.expiresAt <= now) ||
      !canRead(token.scopes)
    )
      deny();
    return;
  }
  if (credential.kind === "oauth_client") {
    const client = await tx.oauthClient.findUnique({
      where: { clientId: credential.id },
      select: { disabled: true, scopes: true },
    });
    const consent = await tx.oauthConsent.findFirst({
      where: { clientId: credential.id, userId: context.actor.id },
      select: { scopes: true },
    });
    if (
      !client ||
      client.disabled ||
      !consent ||
      !canReadOAuth(client.scopes) ||
      !canReadOAuth(consent.scopes)
    )
      deny();
    return;
  }
  deny();
}
