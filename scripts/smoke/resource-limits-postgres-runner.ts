import { createKeywordBatch } from "@/lib/actions/keyword-helpers";
import { prisma } from "@/lib/db/prisma";
import { createProjectRecord } from "@/lib/api/project-service";
import { KeywordLimitExceededError, ProjectLimitExceededError } from "@/lib/api/resource-limits";
import { Client } from "pg";
import { restBatch } from "./resource-limits-rest";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function raceBehindCountLock<T>(table: "keywords" | "projects", operations: (() => Promise<T>)[]) {
  const gate = new Client({ connectionString: process.env.DATABASE_URL });
  await gate.connect();
  await gate.query("BEGIN");
  await gate.query(`LOCK TABLE "${table}" IN ACCESS EXCLUSIVE MODE`);
  const pending = operations.map((operation) => operation());
  await wait(100);
  await gate.query("COMMIT");
  await gate.end();
  return Promise.allSettled(pending);
}

async function projectRace(ownerId: string) {
  process.env.BISIBILITY_MAX_PROJECTS_PER_USER = "1";
  const results = await raceBehindCountLock("projects", [
    () =>
      createProjectRecord(
        { domain: "race-a.example", name: "Race A", trackingScope: "country" },
        ownerId,
      ),
    () =>
      createProjectRecord(
        { domain: "race-b.example", name: "Race B", trackingScope: "country" },
        ownerId,
      ),
  ]);
  const successes = results.filter((result) => result.status === "fulfilled");
  const failures = results.filter((result) => result.status === "rejected");
  const count = await prisma.project.count({ where: { isSample: false, ownerId } });

  assert(successes.length === 1, `project race produced ${successes.length} successes`);
  assert(
    failures.length === 1 && failures[0]?.reason instanceof ProjectLimitExceededError,
    "project race did not return one stable limit error",
  );
  assert(count === 1, `project race persisted ${count} non-sample projects`);
  return { count, failures: failures.length, successes: successes.length };
}

type KeywordSeed = {
  device: "desktop" | "mobile";
  keywords: string[];
  location: string;
  locationId: string;
  projectId: string;
  schedule: null;
  tags: string[];
};

async function writeKeywords(input: KeywordSeed) {
  return prisma.$transaction((tx) => createKeywordBatch(tx, input));
}

async function keywordRace(ownerId: string, locationId: string) {
  process.env.BISIBILITY_MAX_PROJECTS_PER_USER = "0";
  const project = await prisma.project.create({
    data: {
      domain: "keywords.example",
      name: "Keyword race",
      ownerId,
      publicId: "prj_a00000000000000000000001",
      trackingScope: "country",
    },
  });
  process.env.BISIBILITY_MAX_KEYWORDS_PER_PROJECT = "1";
  const base = {
    device: "desktop" as const,
    location: "United States",
    locationId,
    projectId: project.id,
    schedule: null,
    tags: [],
  };
  const results = await raceBehindCountLock("keywords", [
    () => writeKeywords({ ...base, keywords: ["first keyword"] }),
    () => writeKeywords({ ...base, keywords: ["second keyword"] }),
  ]);
  const successes = results.filter((result) => result.status === "fulfilled");
  const failures = results.filter((result) => result.status === "rejected");
  const count = await prisma.keyword.count({ where: { projectId: project.id } });

  assert(successes.length === 1, `keyword race produced ${successes.length} successes`);
  assert(
    failures.length === 1 && failures[0]?.reason instanceof KeywordLimitExceededError,
    "keyword race did not return one stable limit error",
  );
  assert(count === 1, `keyword race persisted ${count} keywords`);

  const existing = await prisma.keyword.findFirstOrThrow({ where: { projectId: project.id } });
  const retry = await writeKeywords({ ...base, keywords: [existing.text] });
  assert(retry.length === 0, `duplicate-only retry returned ${retry.length} created rows`);

  process.env.BISIBILITY_MAX_KEYWORDS_PER_PROJECT = "2";
  const mixed = await writeKeywords({
    ...base,
    keywords: [existing.text, "mixed net new"],
  });
  assert(mixed.length === 1, `mixed batch returned ${mixed.length} created rows`);
  const finalCount = await prisma.keyword.count({ where: { projectId: project.id } });
  assert(finalCount === 2, `mixed batch persisted ${finalCount} keywords`);

  return {
    count,
    failures: failures.length,
    finalCount,
    mixedCreated: mixed.length,
    retryCreated: retry.length,
    successes: successes.length,
  };
}

async function main() {
  const version = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version()`;
  assert(version[0]?.version.includes("PostgreSQL 16"), `unexpected PostgreSQL: ${version[0]?.version}`);
  const user = await prisma.user.create({
    data: {
      email: "throughput@example.test",
      name: "Throughput Harness",
      publicId: "usr_a00000000000000000000000",
    },
  });
  const location = await prisma.location.upsert({
    create: {
      canonicalKey: "US",
      countryCode: "US",
      displayName: "United States",
      gl: "us",
      hl: "en",
      kind: "country",
      languageCode: "en",
      languageLabel: "English",
      primaryGeoName: "United States",
      secondaryGeoName: "United States",
    },
    update: {},
    where: { canonicalKey: "US" },
  });
  const projectRaceUser = await prisma.user.create({
    data: {
      email: "project-race@example.test",
      name: "Project Race Harness",
      publicId: "usr_a00000000000000000000001",
    },
  });
  const evidence = {
    keywordRace: await keywordRace(user.id, location.id),
    postgres: version[0]?.version,
    projectRace: await projectRace(projectRaceUser.id),
    restBatch: await restBatch(user.id),
  };
  console.log(JSON.stringify(evidence, null, 2));
}

await main().finally(() => prisma.$disconnect());
