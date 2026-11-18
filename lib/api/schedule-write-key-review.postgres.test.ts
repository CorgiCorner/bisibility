import type { ApiContext } from "@/lib/api/context";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { seedReviewProject } from "@/lib/schedules/review-permit.postgres-fixture";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { previewPublicSchedule, updatePublicSchedule } from "./schedule-write-routes";

const state = vi.hoisted(() => ({ db: undefined as PrismaClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", async (original) => ({
  ...(await original<typeof import("@/lib/providers/crypto")>()),
  getPurposeSecretKeys: () => [Buffer.from("synthetic-schedule-review-key-0123456789")],
}));
vi.mock("@/lib/redis/redis", () => ({ getRedisClient: async () => null }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_target, key) => {
        const value = db()[key as keyof PrismaClient];
        return typeof value === "function" ? value.bind(db()) : value;
      },
    },
  ),
}));

function db() {
  if (!state.db) throw new Error("Owned database fixture is not ready.");
  return state.db;
}

beforeAll(() => {
  const url = process.env.DATABASE_URL;
  if (!url || process.env.DIRECT_URL !== url)
    throw new Error("An owned fixture database is required.");
  const parsed = new URL(url);
  if (
    parsed.hostname !== "127.0.0.1" ||
    !["/credits_fixture", "/cadence_fixture"].includes(parsed.pathname) ||
    ["5440", "55441", "55447", "55448"].includes(parsed.port)
  )
    throw new Error("An owned fixture database is required.");
  state.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
});
afterAll(async () => {
  await state.db?.$disconnect();
});

type Credential = { kind: "project_key"; keyId: string } | { kind: "user" };

async function fixture() {
  const seed = await seedReviewProject(db());
  const project = await db().project.findUniqueOrThrow({ where: { id: seed.projectId } });
  const keyId = `key-for-${project.id}`;
  // The router lets a project key act as the project owner with the creator's capped role.
  const context = (credential: Credential, path: string[], body: unknown): ApiContext => {
    const url = new URL(`https://example.com/api/v1/${path.join("/")}`);
    const key = credential.kind === "project_key";
    return {
      actor: seed.actor,
      actorId: key ? null : seed.userId,
      auth: key
        ? {
            kind: "project_key",
            creatorRole: "admin",
            apiKey: {
              id: credential.keyId,
              name: "Fixture",
              prefix: "fixture",
              projectId: project.id,
              createdById: seed.userId,
              scopes: ["write"],
            },
            project,
          }
        : {
            kind: "native_session",
            project,
            scopes: ["read", "write", "admin"],
          },
      headers: new Headers(),
      instance: "urn:test",
      method: "POST",
      origin: key
        ? {
            credentialId: credential.keyId,
            credentialKind: "project_key",
            source: "api",
            surface: "programmatic",
          }
        : { credentialId: null, credentialKind: null, source: "app", surface: "app" },
      path,
      req: new Request(url, {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      url,
    } as ApiContext;
  };
  const update = { kind: "rank", cadence: { frequency: "daily" } };
  const schedulePath = ["projects", seed.projectPublicId, "schedules", seed.schedulePublicId];
  const preview = async (credential: Credential) => {
    const response = await previewPublicSchedule(
      context(credential, ["projects", seed.projectPublicId, "schedules", "preview"], {
        operation: "update",
        schedule_id: seed.schedulePublicId,
        schedule: update,
      }),
    );
    const body = await response.json();
    expect(body).toMatchObject({ requires_review: true });
    const { preview_token, expected_revision, window_start } = body;
    expect(preview_token).toEqual(expect.any(String));
    return { preview_token, expected_revision, window_start };
  };
  const write = (credential: Credential, review: unknown) =>
    updatePublicSchedule(context(credential, schedulePath, { ...update, review }));
  const schedule = () =>
    db().checkSchedule.findUniqueOrThrow({ where: { publicId: seed.schedulePublicId } });
  const receipts = () => db().scheduleReviewReceipt.findMany({ where: { projectId: project.id } });
  return { ...seed, keyId, preview, receipts, schedule, write };
}

it.each(["owner-to-key", "key-to-owner", "key-to-key"])(
  "refuses a REST schedule review token across %s credentials",
  async (direction) => {
    const f = await fixture();
    const owner: Credential = { kind: "user" };
    const key: Credential = { kind: "project_key", keyId: f.keyId };
    const otherKey: Credential = { kind: "project_key", keyId: `other-${f.keyId}` };
    const review = await f.preview(direction === "owner-to-key" ? owner : key);
    const recipient =
      direction === "owner-to-key" ? key : direction === "key-to-owner" ? owner : otherKey;

    await expect(f.write(recipient, review)).rejects.toMatchObject({
      code: "schedule_review_stale",
    });
    expect((await f.schedule()).frequency).toBe("weekly");
    expect(await f.receipts()).toHaveLength(0);
  },
);

it("records the project key and no user on a REST key review receipt and its audit", async () => {
  const f = await fixture();
  const key: Credential = { kind: "project_key", keyId: f.keyId };
  const response = await f.write(key, await f.preview(key));
  expect(response.status).toBe(200);
  expect((await f.schedule()).frequency).toBe("daily");
  expect(await f.receipts()).toEqual([expect.objectContaining({ actorId: null })]);
  expect(
    await db().auditLog.findFirst({
      where: { projectId: f.projectId, action: "check_schedule.update" },
    }),
  ).toMatchObject({
    actorId: null,
    after: { credentialId: f.keyId, credentialKind: "project_key" },
  });
});

it("keeps the user as the actor on a personal REST schedule review", async () => {
  const f = await fixture();
  const owner: Credential = { kind: "user" };
  const response = await f.write(owner, await f.preview(owner));
  expect(response.status).toBe(200);
  expect(await f.receipts()).toEqual([expect.objectContaining({ actorId: f.userId })]);
  const audit = await db().auditLog.findFirstOrThrow({
    where: { projectId: f.projectId, action: "check_schedule.update" },
  });
  expect(audit.actorId).toBe(f.userId);
  expect(audit.after).not.toHaveProperty("credentialKind");
});
