import "server-only";

import { makePublicId } from "@/lib/actions/_shared";
import {
  Device,
  LocationKind,
  type Prisma,
  RankCheckFrequency,
  Role,
} from "@/lib/generated/prisma/client";
import { seedKeywordDispatchStates } from "@/lib/rank-check/dispatcher-state";
import type { SampleSignalFixture } from "./fixture-types";
import { buildSampleDataset } from "./fixtures";
import { makeSamplePublicId } from "./public-id";

const SAMPLE_PROVIDER = "sample";

type SamplePrisma = {
  $transaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
};
type SampleTransactionClient = Pick<
  Prisma.TransactionClient,
  | "$executeRaw"
  | "$queryRaw"
  | "keyword"
  | "keywordTrafficSnapshot"
  | "location"
  | "project"
  | "rankCheck"
  | "signal"
  | "tag"
>;
type SampleProject = { domain: string; id: string; name: string; publicId: string };

function manualSchedule(lastCheckedAt: Date | null = null) {
  return {
    cronExpression: null,
    frequency: RankCheckFrequency.manual,
    jitterMinutes: 0,
    lastCheckedAt,
    nextCheckAt: null,
    timezone: "UTC",
  };
}

async function ensureUsLocation(tx: Pick<Prisma.TransactionClient, "location">) {
  return tx.location.upsert({
    create: {
      canonicalKey: "US",
      cityName: null,
      countryCode: "US",
      displayName: "United States",
      gl: "us",
      hl: "en",
      kind: LocationKind.country,
      languageLabel: "English",
      primaryGeoCode: null,
      primaryGeoName: "United States",
      regionCode: null,
      secondaryGeoName: "United States",
    },
    update: {},
    where: { canonicalKey: "US" },
  });
}

function installedPayload(signal: SampleSignalFixture, rankCheckId: string) {
  if (signal.type !== "ranking.changed") {
    return signal.payload;
  }
  return { ...signal.payload, rankCheckId };
}

async function installSampleDatasetInTransaction(
  tx: SampleTransactionClient,
  ownerId: string,
  referenceDate = new Date(),
): Promise<SampleProject> {
  const dataset = buildSampleDataset(referenceDate);

  const location = await ensureUsLocation(tx);
  const project = await tx.project.create({
    data: {
      defaults: { create: manualSchedule() },
      domain: "acme.dev",
      members: { create: { publicId: makePublicId("mbr"), role: Role.owner, userId: ownerId } },
      name: "Sample project - acme.dev",
      ownerId,
      isSample: true,
      publicId: makeSamplePublicId(),
      trackingScope: "country",
    },
    select: { domain: true, id: true, name: true, publicId: true },
  });

  await tx.tag.createMany({
    data: dataset.tags.map((tag) => ({
      ...tag,
      projectId: project.id,
      publicId: makePublicId("tag"),
    })),
    skipDuplicates: true,
  });
  const tags = await tx.tag.findMany({
    select: { id: true, name: true },
    where: { projectId: project.id },
  });
  const tagIdByName = new Map(tags.map((tag) => [tag.name, tag.id]));
  const lastCheckedAt = dataset.rankChecks.at(-1)?.checkedAt ?? null;
  const keywordIdByKey = new Map<string, string>();

  for (const item of dataset.keywords) {
    const keywordTags = item.tags.flatMap((tagName) => {
      const tagId = tagIdByName.get(tagName);
      return tagId ? [{ tagId }] : [];
    });
    const keyword = await tx.keyword.create({
      data: {
        device: Device.desktop,
        intent: item.intent,
        location: location.displayName,
        locationId: location.id,
        projectId: project.id,
        publicId: makePublicId("kw"),
        schedule: { create: manualSchedule(lastCheckedAt) },
        tags: keywordTags.length > 0 ? { create: keywordTags } : undefined,
        targetUrl: item.targetUrl,
        text: item.text,
        topic: item.topic,
      },
      select: { id: true },
    });
    await seedKeywordDispatchStates([keyword.id], {}, tx as Prisma.TransactionClient);
    keywordIdByKey.set(item.key, keyword.id);
  }

  const rankCheckIdByKey = new Map<string, string>();
  for (const check of dataset.rankChecks) {
    const keywordId = keywordIdByKey.get(check.keywordKey);
    if (!keywordId) continue;
    const row = await tx.rankCheck.create({
      data: {
        attemptCount: 1,
        checkedAt: check.checkedAt,
        costCents: "0",
        estimatedCostCents: "0",
        degradedToCountry: false,
        keywordId,
        organicRanks: [],
        position: check.position,
        previousPosition: check.previousPosition,
        provider: SAMPLE_PROVIDER,
        publicId: makePublicId("check"),
        rankingUrl: check.rankingUrl,
        raw: { source: "sample_data" },
        status: "completed",
        viaFallback: false,
      },
      select: { id: true },
    });
    rankCheckIdByKey.set(check.key, row.id);
  }

  await tx.signal.createMany({
    data: dataset.signals.flatMap((signal) => {
      const keywordId = keywordIdByKey.get(signal.keywordKey);
      const rankCheckId = rankCheckIdByKey.get(signal.rankCheckKey);
      if (!keywordId || !rankCheckId) return [];
      return [
        {
          happenedAt: signal.happenedAt,
          keywordId,
          payload: installedPayload(signal, rankCheckId),
          projectId: project.id,
          publicId: makePublicId("sig"),
          severity: signal.severity,
          source: "rank_tracker",
          type: signal.type,
          url: signal.url,
        },
      ];
    }),
  });

  await tx.keywordTrafficSnapshot.createMany({
    data: dataset.trafficSnapshots.flatMap((snapshot) => {
      const { keywordKey, ...data } = snapshot;
      const keywordId = keywordIdByKey.get(keywordKey);
      if (!keywordId) return [];
      return [{ ...data, keywordId, provider: SAMPLE_PROVIDER }];
    }),
    skipDuplicates: true,
  });

  return project;
}

export async function installSampleDataset(
  prismaClient: SamplePrisma | SampleTransactionClient,
  ownerId: string,
  referenceDate = new Date(),
): Promise<SampleProject> {
  if ("$transaction" in prismaClient) {
    return prismaClient.$transaction((tx) =>
      installSampleDatasetInTransaction(tx, ownerId, referenceDate),
    );
  }

  return installSampleDatasetInTransaction(prismaClient, ownerId, referenceDate);
}
