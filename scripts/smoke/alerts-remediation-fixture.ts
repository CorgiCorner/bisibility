import assert from "node:assert/strict";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import type { RankCheckRunResult } from "@/lib/rank-check/runner-result";
import {
  persistRankCheck,
  type PersistRankCheckDependencies,
} from "@/lib/rank-check/runner-persistence";

export type AcceptanceFixture = Awaited<ReturnType<typeof createAcceptanceFixture>>;

export async function createAcceptanceFixture(prefix: string) {
  assert.match(prefix, /^alerts-remediation-test-/);
  const users = await Promise.all(
    [
      { label: "owner", name: "Acceptance Owner" },
      { label: "member-in", name: "Acceptance Member In" },
      { label: "member-out", name: "Acceptance Member Out" },
    ].map(({ label, name }) =>
      prisma.user.create({
        data: {
          email: `${prefix}-${label}@example.com`,
          emailVerified: true,
          id: `${prefix}-user-${label}`,
          name: `${prefix}-${name}`,
          publicId: makePublicId("usr"),
        },
      }),
    ),
  );
  const [owner, optedIn, optedOut] = users;
  assert(owner && optedIn && optedOut);
  const project = await prisma.project.create({
    data: {
      domain: `${prefix}.example.com`,
      id: `${prefix}-project`,
      name: `${prefix}-project`,
      ownerId: owner.id,
      publicId: makePublicId("prj"),
    },
  });
  await prisma.membership.createMany({
    data: [
      {
        id: `${prefix}-membership-in`,
        projectId: project.id,
        publicId: makePublicId("mbr"),
        role: "member",
        userId: optedIn.id,
      },
      {
        id: `${prefix}-membership-out`,
        projectId: project.id,
        publicId: makePublicId("mbr"),
        role: "member",
        userId: optedOut.id,
      },
    ],
  });
  await prisma.notificationPreference.createMany({
    data: [
      preference(`${prefix}-preference-owner`, owner.id, project.id, true),
      preference(`${prefix}-preference-in`, optedIn.id, project.id, true),
      preference(`${prefix}-preference-out`, optedOut.id, project.id, false),
    ],
  });
  const location = await prisma.location.create({
    data: {
      canonicalKey: `${prefix}-location`,
      countryCode: "US",
      displayName: `${prefix}-location`,
      gl: "us",
      hl: "en",
      id: `${prefix}-location`,
      kind: "country",
      languageLabel: "English",
      primaryGeoName: "United States",
      secondaryGeoName: "",
    },
  });
  return { location, optedIn, optedOut, owner, prefix, project };
}

function preference(id: string, userId: string, projectId: string, checkInApp: boolean) {
  return { alertEmail: true, alertInApp: true, checkInApp, id, projectId, userId };
}

export async function createKeyword(
  fixture: AcceptanceFixture,
  label: string,
  targetUrl = `https://${fixture.project.domain}/target`,
) {
  return prisma.keyword.create({
    data: {
      device: "desktop",
      id: `${fixture.prefix}-keyword-${label}`,
      location: fixture.location.displayName,
      locationId: fixture.location.id,
      projectId: fixture.project.id,
      publicId: makePublicId("kw"),
      targetUrl,
      text: `${fixture.prefix}-keyword-${label}`,
    },
  });
}

type PersistAcceptanceCheckInput = {
  checkedAt: Date;
  keyword: Awaited<ReturnType<typeof createKeyword>>;
  position: number | null;
  previousPosition: number | null;
  previousRankingUrl?: string | null;
  rankingUrl?: string | null;
  trigger: "manual" | "scheduled";
  rankCheckId?: string;
};

export async function persistAcceptanceCheck(
  fixture: AcceptanceFixture,
  input: PersistAcceptanceCheckInput,
  dependencies: PersistRankCheckDependencies,
) {
  const rankCheckId = input.rankCheckId ?? `${input.keyword.id}-check-${input.checkedAt.getTime()}`;
  await prisma.rankCheck.upsert({
    create: {
      checkedAt: input.checkedAt,
      id: rankCheckId,
      keywordId: input.keyword.id,
      previousPosition: input.previousPosition,
      provider: "acceptance-fake",
      publicId: makePublicId("check"),
      status: "running",
      trigger: input.trigger,
    },
    update: { status: "running" },
    where: { id: rankCheckId },
  });
  const result: RankCheckRunResult = {
    rankCheck: {
      billingUnits: null,
      checkedAt: input.checkedAt,
      costCents: 0,
      estimatedCostCents: null,
      keywordId: input.keyword.id,
      organicRanks: null,
      position: input.position,
      previousPosition: input.previousPosition,
      provider: "acceptance-fake",
      rankingUrl: input.rankingUrl ?? null,
      raw: null,
      requestedDepth: 100,
    },
    scheduleUpdate: { lastCheckedAt: input.checkedAt, nextCheckAt: null },
  };
  return persistRankCheck(
    {
      existingRankCheckId: rankCheckId,
      hasDefaults: false,
      hasSchedule: false,
      keywordId: input.keyword.id,
      keywordPublicId: input.keyword.publicId,
      keywordTargetUrl: input.keyword.targetUrl,
      previousRankingUrl: input.previousRankingUrl ?? null,
      projectId: fixture.project.id,
    },
    result,
    dependencies,
  );
}

export async function cleanupAcceptanceFixture(fixture: AcceptanceFixture) {
  const userIds = [fixture.owner.id, fixture.optedIn.id, fixture.optedOut.id];
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: userIds } }, { projectId: fixture.project.id }] },
  });
  await prisma.project.deleteMany({ where: { id: fixture.project.id } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.location.deleteMany({ where: { id: fixture.location.id } });
  const [projects, users, locations] = await Promise.all([
    prisma.project.count({ where: { id: fixture.project.id } }),
    prisma.user.count({ where: { email: { startsWith: fixture.prefix } } }),
    prisma.location.count({ where: { canonicalKey: { startsWith: fixture.prefix } } }),
  ]);
  assert.deepEqual({ locations, projects, users }, { locations: 0, projects: 0, users: 0 });
}

export { prisma };
