import type { Prisma } from "@/lib/generated/prisma/client";
import { ACTIVE_RUN_STATUSES } from "@/lib/rank-check/runs/contract";

type ProjectLockClient = {
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
};

export async function lockProjectForProviderMutation(
  tx: ProjectLockClient,
  internalProjectId: string,
) {
  await tx.$queryRaw`SELECT "id" FROM "projects" WHERE "id" = ${internalProjectId} FOR UPDATE`;
}

/** Accepted items retain their connection until all work is terminal. */
export async function hasAcceptedConnectionRun(
  client: Pick<Prisma.TransactionClient, "rankCheckRun">,
  projectId: string,
  connectionId: string,
) {
  return Boolean(
    await client.rankCheckRun.findFirst({
      select: { id: true },
      where: {
        projectId,
        selectionSpec: { path: ["providerConnectionId"], equals: connectionId },
        OR: [
          { status: { in: [...ACTIVE_RUN_STATUSES] } },
          { status: "blocked", items: { some: { status: { in: ["queued", "running"] } } } },
        ],
      },
    }),
  );
}
