import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { databaseConnectionConfig, databaseSchemaFromUrl } from "../lib/db/pool-config.ts";
import type { PublicIdPrefix } from "../lib/db/public-id.ts";
import { withPublicIdWrites } from "../lib/db/public-id-writes.ts";
import {
  Device,
  PrismaClient,
  ProjectMarketStatus,
  ProviderKind,
  ProviderStatus,
  RankCheckFrequency,
  Role,
} from "../lib/generated/prisma/client.ts";
import { hashApiKey } from "../lib/providers/crypto.ts";
import { acmeSeedKeywords } from "../lib/sample-data/acme-seed-keywords.ts";
import { densePositionSeries } from "../lib/sample-data/dense-position-series.ts";
import {
  type AcmeKeywordFixture,
  acmeCheckDates,
  acmeTagDefinitions,
} from "../lib/sample-data/fixtures.ts";
import { seedDemoMarketLocations } from "./location-seed.ts";

const datasourceUrl =
  process.env.DATABASE_URL ?? "postgresql://bisibility:bisibility@localhost:5432/bisibility";
const prisma = withPublicIdWrites(
  new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: datasourceUrl, ...databaseConnectionConfig(datasourceUrl), max: 1 },
      { schema: databaseSchemaFromUrl(datasourceUrl) },
    ),
  }),
);
const API_KEY_PREFIX_LENGTH = 21;
const ENV_SEEDED_API_KEY_MIN_BODY_LENGTH = 19;
const ENV_SEEDED_API_KEY_PREFIXES = ["bsb_key_live_", "bsb_key_test_"] as const;
const ENV_SEEDED_API_KEY_NAME = "E2E examples key (env-seeded)";
const CLI_OAUTH_CLIENT_ID = "bisibility-cli";

/** Derives a deterministic, non-secret fixture identifier from seed material. */
// codeql[js/insufficient-password-hash] -- Deterministic seed identifier, not password verification.
function seededPublicId(prefix: PublicIdPrefix, key: string) {
  return `${prefix}_a${createHash("sha256").update(key).digest("hex").slice(0, 23)}`;
}

function seedProjects() {
  return {
    acme: {
      publicId: process.env.BISIBILITY_SEEDED_PROJECT_ID ?? seededPublicId("prj", "seed:acme"),
      name: "Demo",
      domain: "acme.dev",
    },
    newsite: {
      publicId: seededPublicId("prj", "seed:newsite"),
      name: "Demo - no data",
      domain: "newsite.dev",
    },
  } as const;
}

type SeedProject = { domain: string; name: string; publicId: string };
type SeedKeyword = AcmeKeywordFixture;

async function upsertWorkspace(ownerId: string, project: SeedProject) {
  const workspace = await prisma.project.upsert({
    where: { publicId: project.publicId },
    update: { domain: project.domain, name: project.name, ownerId },
    create: { ...project, ownerId },
  });
  await prisma.membership.upsert({
    where: { userId_projectId: { projectId: workspace.id, userId: ownerId } },
    update: { role: Role.owner },
    create: {
      projectId: workspace.id,
      publicId: seededPublicId("mbr", `seed:membership:${workspace.id}:${ownerId}`),
      role: Role.owner,
      userId: ownerId,
    },
  });
  return workspace;
}

async function upsertApiKey({
  hashedKey,
  lastUsedAt = null,
  name,
  prefix,
  projectId,
}: {
  hashedKey?: string;
  lastUsedAt?: Date | null;
  name: string;
  prefix: string;
  projectId: string;
}) {
  const keyHash = hashedKey ?? hashApiKey(prefix);
  await prisma.apiKey.upsert({
    where: { hashedKey: keyHash },
    update: { lastUsedAt, name, prefix, projectId, revokedAt: null },
    create: {
      hashedKey: keyHash,
      lastUsedAt,
      name,
      prefix,
      projectId,
      publicId: seededPublicId("key", `seed:api-key:${keyHash}`),
    },
  });
}

function validateEnvSeededApiKey(raw: string) {
  const prefix = ENV_SEEDED_API_KEY_PREFIXES.find((candidate) => raw.startsWith(candidate));
  if (!prefix) {
    throw new Error("BISIBILITY_SEED_API_KEY must start with bsb_key_live_ or bsb_key_test_.");
  }
  const body = raw.slice(prefix.length);
  if (body.length < ENV_SEEDED_API_KEY_MIN_BODY_LENGTH) {
    throw new Error(
      `BISIBILITY_SEED_API_KEY body must be at least ${ENV_SEEDED_API_KEY_MIN_BODY_LENGTH} characters.`,
    );
  }
  if (!/^[A-Za-z0-9_-]+$/.test(body)) {
    throw new Error("BISIBILITY_SEED_API_KEY body must contain only A-Z, a-z, 0-9, _, or -.");
  }
}

async function upsertEnvSeededApiKey(projectId: string) {
  const raw = process.env.BISIBILITY_SEED_API_KEY;
  if (!raw) return;

  validateEnvSeededApiKey(raw);
  await upsertApiKey({
    hashedKey: hashApiKey(raw),
    name: ENV_SEEDED_API_KEY_NAME,
    prefix: raw.slice(0, API_KEY_PREFIX_LENGTH),
    projectId,
  });
}

async function upsertDefaults(projectId: string, lastCheckedAt: Date | null, nextCheckAt: Date) {
  const data = {
    cronExpression: "0 6 * * *",
    frequency: RankCheckFrequency.daily,
    jitterMinutes: 60,
    lastCheckedAt,
    nextCheckAt,
    timezone: "Europe/Warsaw",
  };
  await prisma.projectDefaults.upsert({
    where: { projectId },
    update: data,
    create: { ...data, projectId },
  });
}

type SeedMarket = Awaited<ReturnType<typeof seedDemoMarketLocations>>[number];

async function upsertKeyword(projectId: string, item: SeedKeyword, market: SeedMarket) {
  const publicId = seededPublicId("kw", `seed:${item.publicId}`);
  const data = {
    device: Device.desktop,
    location: market.displayName,
    locationId: market.id,
    targetUrl: item.targetUrl ?? null,
    text: item.text,
  };
  const keyword = await prisma.keyword.upsert({
    where: { publicId },
    update: data,
    create: { ...data, projectId, publicId },
  });
  const schedule = {
    cronExpression: null,
    frequency: item.frequency ? RankCheckFrequency[item.frequency] : RankCheckFrequency.daily,
    jitterMinutes: 60,
    lastCheckedAt: item.positions ? new Date(acmeCheckDates[acmeCheckDates.length - 1]) : null,
    nextCheckAt: item.nextCheckAt
      ? new Date(item.nextCheckAt)
      : new Date("2026-06-19T08:00:00.000Z"),
    timezone: "Europe/Warsaw",
  };
  await prisma.keywordSchedule.upsert({
    where: { keywordId: keyword.id },
    update: schedule,
    create: { ...schedule, keywordId: keyword.id },
  });
  return keyword;
}

async function seedDemoProjectMarkets(projectId: string) {
  const markets = await seedDemoMarketLocations(prisma);
  await prisma.projectMarket.updateMany({
    where: {
      projectId,
      locationId: { notIn: markets.map((market) => market.id) },
    },
    data: { status: ProjectMarketStatus.removed },
  });
  await Promise.all(
    markets.map((market) =>
      prisma.projectMarket.upsert({
        where: { projectId_locationId: { locationId: market.id, projectId } },
        update: { status: ProjectMarketStatus.active },
        create: {
          locationId: market.id,
          projectId,
          publicId: seededPublicId("pmkt", `seed:market:${projectId}:${market.canonicalKey}`),
          status: ProjectMarketStatus.active,
        },
      }),
    ),
  );
  return markets;
}

function isDirectRun() {
  const entrypoint = process.argv[1];
  if (!entrypoint) return false;

  try {
    return realpathSync(entrypoint) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

export async function seed() {
  const projects = seedProjects();
  await prisma.oauthClient.upsert({
    where: { clientId: CLI_OAUTH_CLIENT_ID },
    update: {
      disabled: false,
      grantTypes: ["authorization_code", "refresh_token"],
      name: "Bisibility CLI",
      public: true,
      redirectUris: ["http://127.0.0.1/callback"],
      requirePKCE: true,
      responseTypes: ["code"],
      scopes: ["openid", "profile", "email", "offline_access", "tokens:write"],
      tokenEndpointAuthMethod: "none",
      type: "native",
    },
    create: {
      clientId: CLI_OAUTH_CLIENT_ID,
      contacts: [],
      disabled: false,
      grantTypes: ["authorization_code", "refresh_token"],
      id: "oc_bisibility_cli",
      name: "Bisibility CLI",
      postLogoutRedirectUris: [],
      public: true,
      redirectUris: ["http://127.0.0.1/callback"],
      requirePKCE: true,
      responseTypes: ["code"],
      scopes: ["openid", "profile", "email", "offline_access", "tokens:write"],
      tokenEndpointAuthMethod: "none",
      type: "native",
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: "demo@acme.dev" },
    update: { image: null, isInstanceAdmin: true, name: "Alex Kim", role: Role.owner },
    create: {
      email: "demo@acme.dev",
      emailVerified: true,
      image: null,
      isInstanceAdmin: true,
      name: "Alex Kim",
      publicId: seededPublicId("usr", "seed:demo-owner"),
      role: Role.owner,
    },
  });

  const acme = await upsertWorkspace(owner.id, projects.acme);
  const newsite = await upsertWorkspace(owner.id, projects.newsite);
  const demoMarkets = await seedDemoProjectMarkets(acme.id);

  const lastCheckedAt = new Date(acmeCheckDates[acmeCheckDates.length - 1]);
  const nextCheckAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  nextCheckAt.setUTCHours(6, 0, 0, 0);
  await upsertDefaults(acme.id, lastCheckedAt, nextCheckAt);
  await upsertDefaults(newsite.id, null, nextCheckAt);
  await prisma.providerConnection.deleteMany({
    where: { projectId: newsite.id },
  });
  // "Demo - no data" stays truly empty so it demonstrates the first-run experience:
  // no keywords, no checks, just the getting-started checklist.
  await prisma.rankCheck.deleteMany({ where: { keyword: { projectId: newsite.id } } });
  await prisma.keyword.deleteMany({ where: { projectId: newsite.id } });

  const tagByName = new Map<string, string>();
  for (const { color, name } of acmeTagDefinitions) {
    const tag = await prisma.tag.upsert({
      where: { projectId_name: { name, projectId: acme.id } },
      update: { color },
      create: {
        color,
        name,
        projectId: acme.id,
        publicId: seededPublicId("tag", `seed:tag:${acme.id}:${name}`),
      },
    });
    tagByName.set(name, tag.id);
  }

  await prisma.providerConnection.upsert({
    where: { projectId_provider: { projectId: acme.id, provider: "dataforseo" } },
    update: {
      costPerCheckCents: "1.5500",
      credentialsEncrypted: null,
      kind: ProviderKind.serp,
      lastUsedAt: new Date("2026-06-18T08:42:00.000Z"),
      priority: 0,
      status: ProviderStatus.connected,
    },
    create: {
      costPerCheckCents: "1.5500",
      credentialsEncrypted: null,
      kind: ProviderKind.serp,
      lastUsedAt: new Date("2026-06-18T08:42:00.000Z"),
      priority: 0,
      projectId: acme.id,
      provider: "dataforseo",
      publicId: seededPublicId("conn", `seed:provider:${acme.id}:dataforseo`),
      status: ProviderStatus.connected,
    },
  });

  await upsertApiKey({
    hashedKey: "sha256:demo-production-api-key-hash-4f2a",
    lastUsedAt: new Date("2026-06-18T10:06:00.000Z"),
    name: "Production",
    prefix: "bsb_key_live_4f2a",
    projectId: acme.id,
  });
  await upsertApiKey({
    name: "Development",
    prefix: "bsb_key_test_newsite_kG3Gm8w",
    projectId: newsite.id,
  });

  await prisma.rankCheck.deleteMany({ where: { keyword: { projectId: acme.id } } });
  for (const [index, item] of acmeSeedKeywords.entries()) {
    const keyword = await upsertKeyword(acme.id, item, demoMarkets[index % demoMarkets.length]);
    for (const tagName of item.tags ?? []) {
      const tagId = tagByName.get(tagName);
      if (tagId) {
        await prisma.keywordTag.upsert({
          where: { keywordId_tagId: { keywordId: keyword.id, tagId } },
          update: {},
          create: { keywordId: keyword.id, tagId },
        });
      }
    }
    const series = item.positions ? densePositionSeries(item.positions, item.publicId) : [];
    await prisma.rankCheck.createMany({
      data: series.map((position, index) => ({
        attemptCount: 1,
        checkedAt: new Date(acmeCheckDates[index]),
        costCents: "1.5500",
        degradedToCountry: false,
        keywordId: keyword.id,
        position,
        previousPosition: index === 0 ? null : series[index - 1],
        provider: "dataforseo",
        publicId: seededPublicId("check", `seed:check:${item.publicId}:${index}`),
        rankingUrl: item.targetUrl,
        raw: { source: "seed", topDepth: 100 },
        requestedDepth: 100,
        viaFallback: false,
      })),
    });
  }

  await upsertEnvSeededApiKey(acme.id);
}

if (isDirectRun()) {
  try {
    await seed();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
