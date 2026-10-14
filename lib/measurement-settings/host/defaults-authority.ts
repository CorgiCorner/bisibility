import "server-only";
import { grantedApiScopes, hasApiScope, parseStoredApiScopes } from "@/lib/api/scope-policy";
import { AuthorizationError } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { definitionProjectScope } from "@/lib/measurement-definitions/access";
import { DefinitionUnavailableError } from "@/lib/measurement-definitions/errors";
import { assertDefaultsProjectKey } from "@/lib/settings/defaults-project-key";
import type { SettingsHostContext, SettingsHostTransaction } from "./contracts";
import { settingsHash } from "./hash";

export type DefaultsHostContext = SettingsHostContext &
  Readonly<{
    /** Only trusted server adapters supply credential identity. */
    credential?: { kind: "project_key" | "personal_token" | "oauth_client"; id: string };
    auditActorId?: string | null;
    action?:
      | "settings.defaults.update"
      | "settings.rank_check_frequency.update"
      | "project_defaults.update";
  }>;
export async function assertDefaultsAuthority(
  tx: SettingsHostTransaction,
  context: DefaultsHostContext,
  projectId: string,
  role: Parameters<typeof canProjectAction>[0],
  write: boolean,
  now: Date,
) {
  if (!canProjectAction(role, "update", "project_defaults"))
    throw new AuthorizationError("forbidden");
  const credential = context.credential;
  if (!credential) return settingsHash("defaults-session", { actorId: context.actor.id });
  if (credential.kind === "project_key") {
    if (context.actor.id !== credential.id || context.auditActorId !== null)
      throw new AuthorizationError("forbidden");
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { id: true, publicId: true },
    });
    if (!project) throw new AuthorizationError("forbidden");
    const scopes = await assertDefaultsProjectKey(tx, credential.id, project, write, now);
    return settingsHash("defaults-project-key", { projectId, keyId: credential.id, scopes });
  }
  if (credential.kind === "oauth_client") {
    if (write) {
      await tx.$queryRaw`SELECT id FROM "oauthClient" WHERE "clientId"=${credential.id} FOR SHARE`;
      await tx.$queryRaw`SELECT id FROM "oauthConsentV2" WHERE "clientId"=${credential.id} AND "userId"=${context.actor.id} FOR SHARE`;
    }
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
      !hasApiScope(grantedApiScopes(client.scopes), "write") ||
      !hasApiScope(grantedApiScopes(consent.scopes), "write")
    )
      throw new AuthorizationError("forbidden");
    return settingsHash("defaults-oauth", {
      clientId: credential.id,
      actorId: context.actor.id,
      scopes: client.scopes,
      consentScopes: consent.scopes,
    });
  }
  if (write) {
    await tx.$queryRaw`SELECT id FROM personal_access_tokens WHERE id=${credential.id} AND "userId"=${context.actor.id} FOR SHARE`;
  }
  const row = await tx.personalAccessToken.findFirst({
    where: { id: credential.id, userId: context.actor.id },
  });
  const scopes = row ? parseStoredApiScopes(row.scopes) : null;
  if (
    !row ||
    row.revokedAt ||
    (row.expiresAt && row.expiresAt <= now) ||
    !scopes ||
    !hasApiScope(scopes, "write")
  )
    throw new AuthorizationError("forbidden");
  return settingsHash("defaults-credential", {
    kind: credential.kind,
    id: credential.id,
    actorId: context.actor.id,
    scopes,
  });
}

/** Trusted adapter context only; no request field can choose the principal kind or role. */
export async function defaultsProjectScope(
  tx: SettingsHostTransaction,
  context: DefaultsHostContext,
  projectRef: string,
  write: boolean,
  now: Date,
) {
  const project =
    context.credential?.kind === "project_key"
      ? await readProjectKeyScope(tx, projectRef)
      : await definitionProjectScope(
          tx,
          context,
          projectRef,
          write ? "update" : "read",
          "project_defaults",
        );
  const role =
    context.credential?.kind === "project_key"
      ? ("admin" as const)
      : (
          await tx.membership.findFirst({
            where: { projectId: project.id, userId: context.actor.id },
            select: { role: true },
          })
        )?.role;
  const authority = await assertDefaultsAuthority(tx, context, project.id, role, write, now);
  if (!role) throw new AuthorizationError("forbidden");
  return { project, role, authority };
}
async function readProjectKeyScope(tx: SettingsHostTransaction, projectRef: string) {
  if (!isPublicIdOfType(projectRef, "prj")) throw new DefinitionUnavailableError();
  const project = await tx.project.findUnique({
    where: { publicId: projectRef },
    select: {
      id: true,
      publicId: true,
      writeMode: true,
      isSample: true,
    },
  });
  if (!project) throw new DefinitionUnavailableError();
  return project;
}
