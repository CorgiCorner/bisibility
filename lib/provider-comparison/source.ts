import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { serpRankLocation } from "@/lib/serp/location";
import { type ComparisonContext, comparisonProviders } from "./types";
export async function loadComparisonSource(
  projectId: string,
  keywordId: string,
  db: Prisma.TransactionClient = prisma,
) {
  const keyword = await db.keyword.findFirst({
    where: { id: keywordId, projectId, archivedAt: null },
    include: { locationRef: true, project: { select: { domain: true, ownerId: true } } },
  });
  if (!keyword?.project.domain) throw new Error("Comparison keyword is unavailable.");
  const connections = await db.providerConnection.findMany({
    where: { projectId, provider: { in: [...comparisonProviders] } },
  });
  return { keyword, connections, location: serpRankLocation(keyword.locationRef) };
}
export async function loadComparisonContext(
  projectId: string,
  keywordId: string,
): Promise<ComparisonContext> {
  const source = await loadComparisonSource(projectId, keywordId);
  const providers = comparisonProviders.map((provider) => {
    const connection = source.connections.find((item) => item.provider === provider);
    const ready =
      connection?.enabled &&
      connection.status === "connected" &&
      (connection.credentialSource === "hosted" ||
        ownCredentialVersion(provider, connection.id, connection.credentialsEncrypted));
    return {
      provider,
      state: !connection
        ? ("missing" as const)
        : ready
          ? ("ready" as const)
          : ("unavailable" as const),
      fundingSource: connection?.credentialSource ?? null,
    };
  });
  return {
    keyword: {
      id: source.keyword.id,
      text: source.keyword.text,
      device: source.keyword.device,
      locationLabel: source.keyword.locationRef.displayName,
    },
    providers,
    available: providers.every((side) => side.state === "ready"),
  };
}
