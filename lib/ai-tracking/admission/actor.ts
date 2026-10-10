import "server-only";
import type { PlanTrackingRunInput } from "@/lib/ai-tracking/contract";
import { authorize } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";

function writable(scopes: readonly string[]) {
  return scopes.includes("write") || scopes.includes("admin");
}
export async function reauthorizeTrackingActor(
  projectId: string,
  input: Pick<PlanTrackingRunInput, "actorId" | "actorCredential">,
) {
  if (!input.actorId) throw new Error("Tracking requires its original authorized actor.");
  const credential = input.actorCredential;
  if (credential?.kind === "project_key") {
    const key = await prisma.apiKey.findFirst({
      where: { id: credential.id, projectId },
      select: { scopes: true, revokedAt: true, expiresAt: true },
    });
    if (
      !key ||
      key.revokedAt ||
      (key.expiresAt && key.expiresAt <= new Date()) ||
      !writable(key.scopes)
    )
      throw new Error("Original tracking project credential was revoked or lost write scope.");
    authorize({ id: input.actorId, memberships: [{ projectId, role: "admin" }] }, "update", {
      type: "project",
      projectId,
    });
    return;
  }
  if (credential?.kind === "personal_token") {
    const token = await prisma.personalAccessToken.findFirst({
      where: { id: credential.id, userId: input.actorId },
      select: { scopes: true, revokedAt: true, expiresAt: true },
    });
    if (
      !token ||
      token.revokedAt ||
      (token.expiresAt && token.expiresAt <= new Date()) ||
      !writable(token.scopes)
    )
      throw new Error("Original tracking personal credential was revoked or lost write scope.");
  }
  if (credential?.kind === "oauth_client") {
    const client = await prisma.oauthClient.findUnique({
      where: { clientId: credential.id },
      select: { disabled: true },
    });
    const consent = await prisma.oauthConsent.findFirst({
      where: { clientId: credential.id, userId: input.actorId },
      select: { scopes: true },
    });
    if (!client || client.disabled || !consent || !writable(consent.scopes))
      throw new Error("Original tracking OAuth consent was revoked or lost write scope.");
  }
  const user = await prisma.user.findUnique({
    where: { id: input.actorId },
    select: {
      id: true,
      deactivatedAt: true,
      memberships: { where: { projectId }, select: { projectId: true, role: true } },
    },
  });
  if (!user || user.deactivatedAt) throw new Error("Original tracking actor is unavailable.");
  authorize(user, "update", { type: "project", projectId });
}
