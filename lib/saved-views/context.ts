import "server-only";

import { type Actor, AuthorizationError } from "@/lib/auth/authorize";

export type SavedViewContext =
  | { actor: Actor; auditActorId: string | null; transport?: "project_api" }
  | { actor: Actor; auditActorId: string; sessionUserId: string; transport: "session" };

/** Only trusted session adapters supply personal identity; legacy API contexts remain shared. */
export function personalSessionUserId(context: SavedViewContext): string {
  if (
    context.transport !== "session" ||
    context.sessionUserId !== context.actor.id ||
    context.auditActorId !== context.sessionUserId
  )
    throw new AuthorizationError("forbidden");
  return context.sessionUserId;
}

export function sessionSavedViewContext(actor: Actor): SavedViewContext {
  return { actor, auditActorId: actor.id, sessionUserId: actor.id, transport: "session" };
}
