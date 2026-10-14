import "server-only";
import { AuthorizationError } from "@/lib/auth/authorize";
import type { LocalStoreContext } from "@/lib/local-monitoring-store/context";
import { retainedProjectReadAuthority } from "@/lib/rank-history/retained-read-authority";
import { type ApiContext, requireApiActor } from "./context";

/** Transport identities are trusted server facts; no request field can provide this context. */
export function localMonitorApiReadContext(ctx: ApiContext): LocalStoreContext {
  const kind = ctx.origin.credentialKind;
  if (kind !== "project_key" && kind !== "personal_token" && kind !== "oauth_client")
    throw new AuthorizationError("forbidden");
  if (kind === "project_key" && ctx.origin.credentialId !== ctx.auth.apiKey.id)
    throw new AuthorizationError("forbidden");
  const actor = kind === "project_key" ? { id: ctx.origin.credentialId } : requireApiActor(ctx);
  return {
    actor,
    readAuthority: retainedProjectReadAuthority(ctx.auth.project.id, {
      actor,
      transport: kind === "project_key" ? "project_key" : "personal_token",
      credentialId: ctx.origin.credentialId,
      credential: { kind, id: ctx.origin.credentialId },
    }),
  };
}
