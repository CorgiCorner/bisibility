import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { BudgetOwner, BudgetScope } from "@usagekit/core";
import { meteringNamespace } from "./runtime";
export async function resolveMeteringOwnership(scope: BudgetScope): Promise<BudgetOwner | null> {
  if (scope.namespace !== meteringNamespace()) return null;
  let principal: string | undefined;
  if (scope.kind === "connection") {
    const row = await prisma.providerConnection.findUnique({
      where: { id: scope.connection },
      select: { project: { select: { ownerId: true } } },
    });
    principal = row?.project.ownerId;
  } else if (scope.kind === "access_credential") {
    const { kind, id } = scope.accessCredential;
    if (kind === "project_key") {
      const row = await prisma.apiKey.findUnique({
        where: { id },
        select: { project: { select: { ownerId: true } } },
      });
      principal = row?.project.ownerId;
    } else if (kind === "personal_token") {
      principal = (
        await prisma.personalAccessToken.findUnique({ where: { id }, select: { userId: true } })
      )?.userId;
    } else if (kind === "oauth_client") {
      principal =
        (await prisma.oauthClient.findUnique({ where: { clientId: id }, select: { userId: true } }))
          ?.userId ?? undefined;
    }
  }
  return principal ? { kind: "principal", namespace: scope.namespace, principal } : null;
}
