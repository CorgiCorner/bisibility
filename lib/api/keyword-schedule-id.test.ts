import { beforeEach, expect, it, vi } from "vitest";
import { bulkKeywords } from "./keyword-bulk";
import { ScheduleReviewRequiredError } from "./keyword-cadence-review";
import { createKeywords } from "./keyword-create";
import { patchKeyword } from "./keywords";

const keywordId = "kw_b00000000000000000000000";
const scheduleId = "sch_a00000000000000000000000";
const projectId = "prj_a00000000000000000000000";
const review = {
  expected_revision: "12",
  preview_token: "token",
  window_start: "2026-11-01T00:00:00.000Z",
};
const mocks = vi.hoisted(() => ({
  commit: vi.fn(),
  createKeywordBatchSet: vi.fn(),
  findFirst: vi.fn(),
  link: vi.fn(),
  setCadence: vi.fn(),
  writeSchedule: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/actions/_shared", () => ({
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
}));
vi.mock("@/lib/actions/keyword-helpers", () => ({
  addTags: vi.fn(),
  createKeywordBatchSet: mocks.createKeywordBatchSet,
}));
vi.mock("@/lib/actions/keyword-schedule-assignment", () => ({ linkCheckSchedule: mocks.link }));
vi.mock("@/lib/auth/audit", () => ({
  writeAudit: vi.fn(),
  withProjectKeyAudit: (_attribution: unknown, run: () => Promise<unknown>) => run(),
}));
vi.mock("@/lib/schedules/keyword-create-write", () => ({ commitKeywordCreate: mocks.commit }));
vi.mock("./keyword-schedule-write", async (original) => ({
  ...(await original<typeof import("./keyword-schedule-write")>()),
  writeKeywordSchedule: mocks.writeSchedule,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    keyword: { findFirst: mocks.findFirst, findMany: vi.fn(async () => []) },
    projectDefaults: { findUnique: vi.fn(async () => ({ serpDepth: 100 })) },
    providerConnection: { findFirst: vi.fn(async () => null) },
  },
}));
vi.mock("@/lib/rank-check/schedules/keyword-cadence", () => ({
  setKeywordCadence: mocks.setCadence,
}));
vi.mock("@/lib/serp/default-market", () => ({
  projectDefaultSerpMarket: () => ({
    city: null,
    country: "United States",
    device: "desktop",
    locationKey: null,
  }),
}));
vi.mock("@/lib/serp/location-service", () => {
  const resolved = {
    location: {
      canonicalKey: "us",
      countryCode: "US",
      displayName: "United States",
      id: "location_1",
      languageCode: "en",
      languageLabel: "English",
    },
    warning: null,
  };
  return {
    resolveKeywordLocation: async () => resolved,
    resolveKeywordLocationUsingStore: async () => resolved,
  };
});
vi.mock("./resources", () => ({
  keywordInclude: {},
  keywordResource: (keyword: { publicId: string }) => ({ id: keyword.publicId }),
  keywordResources: async (keywords: { publicId: string }[]) =>
    keywords.map((keyword) => ({ id: keyword.publicId })),
}));

function api(method: string, path: string, body: unknown) {
  const url = new URL(`https://example.com${path}`);
  return {
    actor: { id: "user_1", memberships: [{ projectId: "project_1", role: "member" }] },
    actorId: "user_1",
    auth: { project: { id: "project_1", publicId: projectId } },
    headers: new Headers(),
    instance: "urn:test",
    method,
    origin: {
      credentialId: "key_test",
      credentialKind: "project_key",
      source: "api",
      surface: "programmatic",
    },
    path: path.split("/").filter(Boolean),
    req: new Request(url, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method,
    }),
    url,
  } as never;
}

const stored = { id: "keyword_1", publicId: keywordId, text: "rank tracker" };
const tx = {
  checkSchedule: { findFirst: vi.fn(async () => ({ id: "schedule_1", publicId: scheduleId })) },
  keyword: { findMany: vi.fn(async () => [stored]), update: vi.fn(async () => stored) },
  keywordTag: { deleteMany: vi.fn() },
};
const create = (body: unknown) =>
  createKeywords(api("POST", `/projects/${projectId}/keywords`, body), projectId);
const patch = (body: unknown) =>
  patchKeyword(api("PATCH", `/keywords/${keywordId}`, body), keywordId);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findFirst.mockResolvedValue({
    device: "desktop",
    id: "keyword_1",
    location: "United States",
    locationId: "location_1",
    publicId: keywordId,
    text: "rank tracker",
  });
  mocks.createKeywordBatchSet.mockResolvedValue({
    accepted: [{ created: true, keyword: stored, row: {} }],
    created: [stored],
  });
  mocks.commit.mockImplementation(
    async (_project: string, _actor: unknown, _change: unknown, _review: unknown, persist) =>
      persist(tx, { consentText: null }),
  );
  mocks.writeSchedule.mockImplementation(async (_ctx, _ids, _id, _review, run) => run(tx));
});

it("creates keywords on a schedule through the strict review commit, without a stored cadence", async () => {
  const response = await create({ keywords: ["rank tracker"], schedule_id: scheduleId, review });
  expect(response.status).toBe(201);
  expect(mocks.commit).toHaveBeenCalledWith(
    "project_1",
    // A project key reviews as itself, never as the user the router acts for.
    { projectKeyId: "key_test" },
    expect.objectContaining({
      op: "keywords-create",
      scheduleId,
      allowPausedSchedule: true,
      cadence: null,
      keywords: [{ keyword: "rank tracker", device: "desktop", locationKey: "us" }],
    }),
    review,
    expect.any(Function),
    { strictReview: true },
  );
  expect(mocks.createKeywordBatchSet.mock.calls[0][2]).toEqual([
    expect.objectContaining({ keyword: "rank tracker", schedule: null }),
  ]);
  expect(mocks.link).toHaveBeenCalledWith(
    tx,
    "project_1",
    { id: "schedule_1", publicId: scheduleId },
    [stored],
    { consentText: null },
  );
});

it("answers 428 when a keyword create on a schedule needs a review", async () => {
  mocks.commit.mockRejectedValue(new ScheduleReviewRequiredError());
  const response = await create([{ keyword: "rank tracker", schedule_id: scheduleId }]);
  expect(response.status).toBe(428);
  expect(await response.json()).toMatchObject({ code: "schedule_review_required" });
  expect(mocks.createKeywordBatchSet).not.toHaveBeenCalled();
});

it.each([
  [{ keywords: [{ keyword: "rank tracker", frequency: "daily" }], schedule_id: scheduleId }],
  [[{ keyword: "rank tracker", schedule_id: scheduleId, schedule: { frequency: "weekly" } }]],
])("refuses schedule_id together with a legacy cadence on create", async (body) => {
  await expect(create(body)).rejects.toMatchObject({
    name: "ApiInputError",
    message: "Send schedule_id or the deprecated schedule and frequency, not both.",
  });
  expect(mocks.commit).not.toHaveBeenCalled();
  expect(mocks.createKeywordBatchSet).not.toHaveBeenCalled();
});

it("moves a patched keyword to a schedule through the reviewed assignment", async () => {
  const response = await patch({ schedule_id: scheduleId, review, tags: ["Product"] });
  expect(response.status).toBe(200);
  expect(mocks.writeSchedule).toHaveBeenCalledWith(
    expect.anything(),
    [keywordId],
    scheduleId,
    review,
    expect.any(Function),
  );
  expect(tx.keyword.update).toHaveBeenCalledTimes(1);
  expect(mocks.setCadence).not.toHaveBeenCalled();
});

it("answers 428 when a patched schedule assignment needs a review", async () => {
  mocks.writeSchedule.mockRejectedValue(new ScheduleReviewRequiredError());
  const response = await patch({ schedule_id: scheduleId });
  expect(response.status).toBe(428);
  expect(tx.keyword.update).not.toHaveBeenCalled();
});

it.each([
  [{ schedule_id: scheduleId, frequency: "daily" }],
  [{ schedule_id: null, schedule: { frequency: "weekly" } }],
])("refuses schedule_id together with a legacy cadence on PATCH", async (body) => {
  await expect(patch(body)).rejects.toMatchObject({ name: "ApiInputError" });
  expect(mocks.writeSchedule).not.toHaveBeenCalled();
  expect(mocks.setCadence).not.toHaveBeenCalled();
});

it.each([
  ["set_schedule", { schedule_id: scheduleId, frequency: "daily" }],
  ["set_frequency", { schedule_id: scheduleId, schedule: { frequency: "weekly" } }],
])("refuses schedule_id together with a legacy cadence on bulk %s", async (operation, fields) => {
  const body = { keyword_ids: [keywordId], operation, ...fields };
  await expect(bulkKeywords(api("POST", "/keywords/bulk", body))).rejects.toMatchObject({
    name: "ApiInputError",
  });
  expect(mocks.writeSchedule).not.toHaveBeenCalled();
  expect(mocks.setCadence).not.toHaveBeenCalled();
});
