import "server-only";
import { hasApiScope, parseStoredApiScopes } from "@/lib/api/scope-policy";
import { AuthorizationError } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import type { Prisma } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";

/** A project credential is not a User. This authority applies only to project defaults. */
export async function assertDefaultsProjectKey(
  tx: Prisma.TransactionClient,
  keyId: string,
  project: { id: string; publicId: string },
  write: boolean,
  now: Date,
) {
  if (write) {
    await lockProjectForProviderMutation(tx, project.id);
    await tx.$queryRaw`SELECT id FROM api_keys WHERE id=${keyId} AND "projectId"=${project.id} FOR SHARE`;
  }
  const [key, current] = await Promise.all([
    tx.apiKey.findFirst({
      where: { id: keyId, projectId: project.id },
      select: { id: true, scopes: true, revokedAt: true, expiresAt: true },
    }),
    tx.project.findUnique({
      where: { id: project.id },
      select: { publicId: true, writeMode: true, isSample: true },
    }),
  ]);
  const scopes = key ? parseStoredApiScopes(key.scopes) : null;
  if (
    !key ||
    key.revokedAt ||
    (key.expiresAt && key.expiresAt <= now) ||
    !scopes ||
    !hasApiScope(scopes, "write") ||
    !current ||
    current.publicId !== project.publicId ||
    !canProjectAction("admin", "update", "project_defaults")
  )
    throw new AuthorizationError("forbidden");
  if (write && (current.writeMode !== "active" || current.isSample))
    throw new ProjectReadOnlyError(project.id);
  return scopes;
}
