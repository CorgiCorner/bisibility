import "server-only";
import { AuthorizationError } from "@/lib/auth/authorize";
import type { DefaultsHostContext } from "@/lib/measurement-settings/host/defaults-authority";
import type { ApiContext } from "./context";
import { requireApiActor } from "./context";
/** User credentials retain their User. Project keys retain only the verified key identity. */
export function defaultsApiContext(ctx: ApiContext): DefaultsHostContext {
  const kind = ctx.origin.credentialKind;
  if (kind !== "project_key" && kind !== "personal_token" && kind !== "oauth_client")
    throw new AuthorizationError("forbidden");
  if (kind === "project_key" && ctx.origin.credentialId !== ctx.auth.apiKey.id)
    throw new AuthorizationError("forbidden");
  const actor = kind === "project_key" ? { id: ctx.auth.apiKey.id } : requireApiActor(ctx);
  return {
    actor,
    auditActorId: kind === "project_key" ? null : actor.id,
    credential: { kind, id: ctx.origin.credentialId },
    action: "project_defaults.update",
  };
}
