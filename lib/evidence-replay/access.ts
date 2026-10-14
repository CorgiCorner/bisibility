import { AuthorizationError, authorize } from "@/lib/auth/authorize";
import type { Role } from "@/lib/generated/prisma/client";
import { replayDigest } from "./hash";
import {
  EvidenceReplayUnavailableError,
  type ReplayAuthority,
  type ReplayDatabase,
  type ReplayPrincipal,
} from "./model";

/** Database session identity, or a fresh authenticated user membership; never claimed request authority. */
export async function replayProjectScope(
  db: ReplayDatabase,
  authority: ReplayAuthority,
  projectPublicId: string,
  write: boolean,
): Promise<ReplayPrincipal> {
  const projectRows = await db.query(
    `SELECT id,"publicId","writeMode","isSample" FROM projects WHERE "publicId"=$1${write ? " FOR SHARE" : ""}`,
    [projectPublicId],
  );
  const project = projectRows.rows[0];
  if (!project || projectRows.rows.length !== 1 || typeof project.id !== "string")
    throw new EvidenceReplayUnavailableError();
  if (write && (project.writeMode !== "active" || project.isSample !== false))
    throw new AuthorizationError("forbidden");
  if (authority.kind === "session") {
    const active = await db.query(
      `SELECT id FROM users WHERE id=$1 AND "deactivatedAt" IS NULL${write ? " FOR SHARE" : ""}`,
      [authority.actor.id],
    );
    const membership = await db.query(
      `SELECT role FROM memberships WHERE "projectId"=$1 AND "userId"=$2${write ? " FOR SHARE" : ""}`,
      [project.id, authority.actor.id],
    );
    const role = membership.rows[0]?.role;
    if (
      active.rows.length !== 1 ||
      membership.rows.length !== 1 ||
      !["viewer", "auditor", "member", "admin", "owner"].includes(String(role))
    )
      throw new AuthorizationError("forbidden");
    authorize(
      { id: authority.actor.id, memberships: [{ projectId: project.id, role: role as Role }] },
      write ? "update" : "read",
      { projectId: project.id, type: "keyword" },
    );
    return {
      kind: authority.kind,
      reference: authority.actor.id,
      projectId: project.id,
      projectPublicId,
    };
  }
  const session = await db.query(
    `SELECT current_user AS role, session_user AS login, current_schema() AS schema, current_setting('TimeZone') AS timezone, has_table_privilege(current_user,'rank_checks',$1) AS allowed`,
    [write ? "UPDATE" : "SELECT"],
  );
  const proof = session.rows[0];
  if (
    !proof ||
    typeof proof.role !== "string" ||
    typeof proof.login !== "string" ||
    proof.schema !== "public" ||
    proof.timezone !== "UTC" ||
    proof.allowed !== true
  )
    throw new AuthorizationError("forbidden");
  return {
    kind: authority.kind,
    reference: replayDigest([proof.login, proof.role]),
    projectId: project.id,
    projectPublicId,
  };
}
