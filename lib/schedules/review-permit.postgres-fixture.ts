import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makePublicId } from "@/lib/db/public-id";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const reserved = new Set([55441, 55447, 55448]);

async function freePort() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const server = createServer();
    await new Promise<void>((accept, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", accept);
    });
    const address = server.address();
    const port = address && typeof address !== "string" ? address.port : 0;
    await new Promise<void>((accept, reject) =>
      server.close((error) => (error ? reject(error) : accept())),
    );
    if (port && !reserved.has(port)) return port;
  }
  throw new Error("Reserved fixture port selected");
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  execFileSync(command, args, { encoding: "utf8", env, timeout: 180_000 });
}

function clientFor(url: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });
}

/** A lane that already owns a migrated loopback fixture database lends it to this suite. */
function providedFixtureUrl() {
  const url = process.env.DATABASE_URL;
  if (!url || process.env.DIRECT_URL !== url) return null;
  const parsed = new URL(url);
  return parsed.hostname === "127.0.0.1" &&
    ["/credits_fixture", "/cadence_fixture"].includes(parsed.pathname) &&
    !reserved.has(Number(parsed.port || 5432))
    ? url
    : null;
}

export async function startReviewFixture() {
  const provided = providedFixtureUrl();
  if (provided) {
    const left = clientFor(provided);
    const right = clientFor(provided);
    return {
      left,
      right,
      async stop() {
        await left.$disconnect().catch(() => undefined);
        await right.$disconnect().catch(() => undefined);
      },
    };
  }
  const directory = mkdtempSync(join(tmpdir(), "schedule-review-pg-"));
  const data = join(directory, "data");
  const env: NodeJS.ProcessEnv = { ...process.env, LC_ALL: "en_US.UTF-8" };
  const port = await freePort();
  const url = `postgresql://fixture@127.0.0.1:${port}/cadence_fixture?connect_timeout=30`;
  env.DATABASE_URL = url;
  env.DIRECT_URL = url;
  run("initdb", ["-D", data, "-U", "fixture", "--auth=trust", "--locale=en_US.UTF-8"], env);
  run(
    "pg_ctl",
    [
      "-D",
      data,
      "-l",
      join(directory, "postgres.log"),
      "-o",
      `-h 127.0.0.1 -p ${port} -k '' -F`,
      "-w",
      "start",
    ],
    env,
  );
  const admin = clientFor(`postgresql://fixture@127.0.0.1:${port}/postgres`);
  await admin.$executeRawUnsafe("CREATE DATABASE cadence_fixture");
  await admin.$disconnect();
  run("npx", ["prisma", "migrate", "deploy"], env);
  const left = clientFor(url);
  const right = clientFor(url);
  return {
    left,
    right,
    async stop() {
      await left.$disconnect().catch(() => undefined);
      await right.$disconnect().catch(() => undefined);
      try {
        run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"], env);
      } catch {
        // The fixture is removed whether or not the server was still up.
      }
      rmSync(directory, { force: true, recursive: true });
    },
  };
}

export async function seedReviewProject(left: PrismaClient) {
  const userId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const projectPublicId = makePublicId("prj");
  const schedulePublicId = makePublicId("sch");
  const locationId = crypto.randomUUID();
  await left.user.create({
    data: {
      email: `${userId}@example.com`,
      id: userId,
      name: "Review fixture",
      publicId: makePublicId("usr"),
    },
  });
  await left.project.create({
    data: {
      domain: "example.com",
      id: projectId,
      name: "Review fixture",
      ownerId: userId,
      publicId: projectPublicId,
    },
  });
  await left.membership.create({
    data: { projectId, publicId: makePublicId("mbr"), role: "admin", userId },
  });
  await left.projectDefaults.create({ data: { projectId, serpDepth: 20, timezone: "UTC" } });
  await left.location.create({
    data: {
      canonicalKey: crypto.randomUUID(),
      countryCode: "US",
      displayName: "United States",
      gl: "us",
      hl: "en",
      id: locationId,
      kind: "country",
      languageCode: "en",
      languageLabel: "English",
      primaryGeoName: "United States",
      secondaryGeoName: "",
    },
  });
  const schedule = await left.checkSchedule.create({
    data: {
      enabled: true,
      frequency: "weekly",
      name: "Weekly",
      projectId,
      providerPolicy: "dataforseo",
      publicId: schedulePublicId,
    },
  });
  await left.keyword.create({
    data: {
      checkScheduleId: schedule.id,
      location: "United States",
      locationId,
      projectId,
      publicId: makePublicId("kw"),
      text: "rank tracker",
    },
  });
  return {
    // Matches the seeded admin membership, so permission checks see the real role.
    actor: { id: userId, memberships: [{ projectId, role: "admin" as const }] },
    projectId,
    projectPublicId,
    schedulePublicId,
    userId,
  };
}
