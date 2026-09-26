import "server-only";

import { prisma } from "@/lib/db/prisma";
import { monthUtcRange } from "@/lib/rank-check/budget";

type ApiKeySpendClient = Pick<typeof prisma, "providerCostEntry">;

/** Maps each internal API key id to its recorded provider cost for the current UTC month. */
export async function monthlySpendByApiKey(
  projectId: string,
  now = new Date(),
  options: { client?: ApiKeySpendClient } = {},
): Promise<Map<string, number>> {
  const client = options.client ?? prisma;
  const groups = await client.providerCostEntry.groupBy({
    _sum: { costCents: true },
    by: ["credentialId"],
    where: {
      cached: false,
      measurementStatus: "recorded",
      createdAt: monthUtcRange(now),
      credentialKind: "project_key",
      projectId,
    },
  });
  return new Map(
    groups.flatMap((group) =>
      group.credentialId ? [[group.credentialId, Number(group._sum.costCents ?? 0)] as const] : [],
    ),
  );
}
