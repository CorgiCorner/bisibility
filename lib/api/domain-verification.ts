import "server-only";
import { verificationInputSchema } from "@/lib/domain-verification/model";
import {
  checkDomainVerification,
  DomainVerificationDisabledError,
  DomainVerificationNotStartedError,
  issueDomainVerification,
  readDomainVerification,
  verificationResource,
} from "@/lib/domain-verification/service";
import { type ApiContext, forbidden, projectMatches, requireApiActor } from "./context";
import { dataResponse, errorResponse } from "./responses";
import { parseApiInput, readJsonBody } from "./surface";

export async function domainVerification(ctx: ApiContext, action: "read" | "issue" | "check") {
  if (!projectMatches(ctx.auth, ctx.path[1])) return forbidden(ctx, "Project scope mismatch.");
  const actor = requireApiActor(ctx);
  try {
    const row =
      action === "read"
        ? await readDomainVerification(ctx.auth.project.id, actor)
        : action === "check"
          ? await checkDomainVerification(
              ctx.auth.project.id,
              actor,
              ctx.actorId ?? null,
              ctx.actorId ? undefined : ctx.auth.apiKey.id,
            )
          : await issueDomainVerification(
              ctx.auth.project.id,
              actor,
              parseApiInput(verificationInputSchema, await readJsonBody(ctx)),
              ctx.actorId ?? null,
            );
    return dataResponse(verificationResource(row), { headers: ctx.headers });
  } catch (error) {
    if (
      error instanceof DomainVerificationDisabledError ||
      error instanceof DomainVerificationNotStartedError
    )
      return errorResponse("not_found", error.message, 404, {
        headers: ctx.headers,
        instance: ctx.instance,
      });
    throw error;
  }
}
