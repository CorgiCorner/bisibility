import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { serpRankLocation } from "@/lib/serp/location";
import type { FrozenComparison } from "./model";
import type { PlaygroundSource } from "./playground-model";
import { quoteComparisonConnections } from "./quote";

export async function quotePlaygroundComparison(
  projectId: string,
  input: PlaygroundSource,
  now: Date,
  db: Prisma.TransactionClient = prisma,
): Promise<FrozenComparison & { version: 2 }> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { domain: true },
  });
  const location = await db.location.findUnique({ where: { id: input.locationId } });
  if (!project?.domain || !location) throw new Error("Search settings are unavailable.");
  const connections = await db.providerConnection.findMany({
    where: { projectId, provider: { in: input.providers } },
  });
  const providers = (["dataforseo", "serpapi"] as const).filter((provider) =>
    input.providers.includes(provider),
  );
  if (
    !providers.length ||
    providers.length !== input.providers.length ||
    !input.query.trim() ||
    input.query.length > 500
  )
    throw new Error("Invalid search settings.");
  const target = await db.keyword.findFirst({
    where: {
      projectId,
      text: input.query,
      locationId: input.locationId,
      device: input.device,
      archivedAt: null,
    },
    select: {
      id: true,
      publicId: true,
      targetUrl: true,
      measurementTargetEpoch: true,
      measurementPolicyEpoch: true,
    },
  });
  return {
    ...(target
      ? {
          trackedTarget: {
            id: target.id,
            publicId: target.publicId,
            targetUrl: target.targetUrl,
            targetEpoch: String(target.measurementTargetEpoch),
            policyEpoch: String(target.measurementPolicyEpoch),
          },
        }
      : {}),
    ...(input.depth === undefined ? {} : { depth: input.depth }),
    version: 2,
    keywordId: null,
    text: input.query,
    device: input.device,
    domain: project.domain,
    locationId: location.id,
    locationKey: location.canonicalKey,
    locationKind: location.kind,
    locationLabel: location.displayName,
    location: serpRankLocation(location),
    connections: await quoteComparisonConnections(
      projectId,
      "serp-playground",
      connections,
      providers,
      now,
      db,
      { allowDisabled: true, depth: input.depth },
    ),
  };
}
