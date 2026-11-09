import { prisma } from "@/lib/db/prisma";
import { encryptSecret } from "@/lib/providers/crypto";

export const now = new Date("2026-11-05T12:00:00.000Z");
export const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
export const publicId = (prefix: string, number: number) =>
  `${prefix}_a${String(number).padStart(23, "0")}`;
export const db = prisma;
export async function clearFixture() {
  await db.auditLog.deleteMany();
  await db.opsEvent.deleteMany();
  await db.operationalRun.deleteMany();
  await db.emailDailyStat.deleteMany();
  await db.instanceMailConfig.deleteMany();
  await db.user.deleteMany();
  await db.location.deleteMany();
}
export async function seedFixture() {
  await clearFixture();
  await db.user.createMany({
    data: [
      {
        id: "actor",
        publicId: publicId("usr", 1),
        name: "Administrator",
        email: "admin@example.com",
        isInstanceAdmin: true,
        twoFactorEnabled: true,
        createdAt: ago(100),
      },
      {
        id: "alice",
        publicId: publicId("usr", 2),
        name: "Alice",
        email: "alice@example.com",
        createdAt: ago(80),
      },
      {
        id: "bob",
        publicId: publicId("usr", 3),
        name: "Bob",
        email: "bob@example.com",
        createdAt: ago(60),
        deactivatedAt: ago(1),
      },
      {
        id: "carol",
        publicId: publicId("usr", 4),
        name: "Carol",
        email: "carol@example.com",
        createdAt: ago(40),
      },
    ],
  });
  await db.session.createMany({
    data: [
      {
        id: "alice-old",
        publicId: publicId("sid", 1),
        userId: "alice",
        token: "fixture-one",
        expiresAt: ago(-24),
        updatedAt: ago(30),
      },
      {
        id: "alice-new",
        publicId: publicId("sid", 2),
        userId: "alice",
        token: "fixture-two",
        expiresAt: ago(-24),
        updatedAt: ago(1),
      },
      {
        id: "bob-session",
        publicId: publicId("sid", 3),
        userId: "bob",
        token: "fixture-three",
        expiresAt: ago(-24),
        updatedAt: ago(2),
      },
    ],
  });
  await db.project.createMany({
    data: [
      { id: "project-one", publicId: publicId("prj", 1), name: "First", ownerId: "alice" },
      { id: "project-two", publicId: publicId("prj", 2), name: "Second", ownerId: "alice" },
      { id: "project-three", publicId: publicId("prj", 3), name: "Third", ownerId: "bob" },
    ],
  });
  await db.membership.createMany({
    data: [
      { publicId: publicId("mbr", 1), userId: "alice", projectId: "project-one" },
      { publicId: publicId("mbr", 2), userId: "carol", projectId: "project-one" },
    ],
  });
  const location = await db.location.create({
    data: {
      id: "fixture-location",
      canonicalKey: "country:fixture",
      countryCode: "US",
      displayName: "United States",
      gl: "us",
      hl: "en",
      kind: "country",
      languageCode: "en",
      languageLabel: "English",
      primaryGeoName: "United States",
      secondaryGeoName: "",
    },
  });
  for (let i = 1; i <= 4; i++) {
    await db.keyword.create({
      data: {
        id: `keyword-${i}`,
        publicId: publicId("kw", i),
        projectId: "project-one",
        locationId: location.id,
        location: "United States",
        text: `keyword ${i}`,
      },
    });
    await db.rankCheck.create({
      data: {
        id: `check-${i}`,
        publicId: publicId("check", i),
        keywordId: `keyword-${i}`,
        provider: "fixture-source",
        status: ["completed", "failed", "deferred", "completed"][i - 1],
        checkedAt: ago(i === 4 ? 48 : 1),
        scheduledAt: ago(i === 4 ? 49 : 2),
        startedAt: ago(i === 4 ? 48 : 1),
        error: i === 2 ? "Provider request timed out" : null,
        deferredReason: i === 3 ? "rate_limited" : null,
        attempts:
          i === 1
            ? [
                { provider: "first-source", status: "failed", message: "Request timed out" },
                { provider: "fixture-source", status: "completed" },
              ]
            : undefined,
      },
    });
  }
  await db.providerConnection.create({
    data: {
      id: "connection",
      publicId: publicId("conn", 1),
      projectId: "project-one",
      kind: "analytics",
      provider: "fixture-analytics",
      status: "connected",
    },
  });
  await db.operationalRun.create({
    data: {
      id: "traffic",
      kind: "traffic_sync",
      projectId: "project-one",
      connectionId: "connection",
      provider: "fixture-analytics",
      status: "succeeded_with_data",
      startedAt: ago(1),
      finishedAt: ago(0.5),
    },
  });
  await db.opsEvent.createMany({
    data: [
      {
        id: "presence",
        kind: "presence_inspection_budget",
        severity: "warning",
        title: "Capacity",
        createdAt: ago(1),
        fields: { "Deferred URLs": 7, "Affected project count": 2 },
        attempts: 2,
      },
      {
        id: "delivered",
        kind: "fixture_notice",
        severity: "info",
        title: "Delivered",
        createdAt: ago(2),
        deliveredAt: ago(1),
        attempts: 1,
      },
    ],
  });
  await db.emailDailyStat.createMany({
    data: [
      { day: new Date("2026-11-05"), category: "bulk", count: 12 },
      { day: new Date("2026-11-05"), category: "transactional", count: 8 },
      { day: new Date("2026-11-04"), category: "bulk", count: 999 },
    ],
  });
  await db.instanceMailConfig.create({
    data: {
      id: "default",
      provider: "smtp",
      sender: "robot@example.com",
      credentialsCipher: encryptSecret(
        JSON.stringify({
          smtpHost: "localhost",
          smtpPort: 1025,
          smtpUsername: "",
          smtpPassword: "",
        }),
      ),
    },
  });
}
