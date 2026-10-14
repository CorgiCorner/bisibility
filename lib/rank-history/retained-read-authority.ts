import "server-only";
import { type Actor, AuthorizationError, authorize, type ResourceType } from "@/lib/auth/authorize";
import { type Prisma, Role } from "@/lib/generated/prisma/client";
import { z } from "zod";
import {
  assertHistoryExportCredential,
  type HistoryExportAuthority,
  snapshotHistoryExportAuthority,
} from "./export-authority";
import type { RetainedCredentialReadPort } from "./retained-credential-port";

/** Server-only, read-scoped credential authority. Request JSON never creates this binding. */
export type RetainedProjectReadAuthority = Readonly<{
  projectId: string;
  credential: HistoryExportAuthority;
}>;
type ReadAuthorityPort = RetainedCredentialReadPort & {
  $queryRaw(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Promise<unknown>;
};
const activeUsersSchema = z.array(z.object({ id: z.string() }));
const membershipRolesSchema = z.array(z.object({ role: z.enum(Role) }));

export function retainedProjectReadAuthority(
  projectId: string,
  credential: HistoryExportAuthority,
): RetainedProjectReadAuthority {
  if (credential.transport === "session" || !credential.credential)
    throw new AuthorizationError("forbidden");
  return { projectId, credential: snapshotHistoryExportAuthority(credential) };
}

/** Fresh credential, user and membership facts share the caller's retained-data transaction. */
export async function authorizeRetainedProjectRead(
  tx: ReadAuthorityPort,
  binding: RetainedProjectReadAuthority,
  suppliedActor: Actor,
  project: { id: string; publicId: string },
  resource: ResourceType,
) {
  const context = binding.credential;
  if (
    binding.projectId !== project.id ||
    context.transport === "session" ||
    suppliedActor.id !== context.actor.id
  )
    throw new AuthorizationError("forbidden");
  await assertHistoryExportCredential(tx, context, project);
  let actor: { id: string; memberships: Array<{ projectId: string; role: Role }> };
  if (context.transport === "project_key") {
    const credential = context.credential;
    if (!credential || credential.kind !== "project_key" || context.actor.id !== credential.id)
      throw new AuthorizationError("forbidden");
    // A key's own identity carries the existing project-key role; it is never a user identity.
    actor = { id: credential.id, memberships: [{ projectId: project.id, role: "admin" }] };
  } else {
    const users = activeUsersSchema.parse(
      await tx.$queryRaw`
      SELECT id FROM users WHERE id=${context.actor.id} AND "deactivatedAt" IS NULL FOR SHARE`,
    );
    if (users.length !== 1 || users[0].id !== context.actor.id)
      throw new AuthorizationError("forbidden");
    const memberships = membershipRolesSchema.parse(
      await tx.$queryRaw`
      SELECT role::text AS role FROM memberships
      WHERE "projectId"=${project.id} AND "userId"=${context.actor.id} FOR SHARE`,
    );
    actor = {
      id: context.actor.id,
      memberships: memberships.map(({ role }) => ({ projectId: project.id, role })),
    };
  }
  return { actor, grant: authorize(actor, "read", { projectId: project.id, type: resource }) };
}
