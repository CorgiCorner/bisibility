import { POST as archive } from "@/app/api/check-schedules/[publicId]/archive/route";
import {
  POST as assign,
  DELETE as remove,
} from "@/app/api/check-schedules/[publicId]/keywords/route";
import { PATCH as update } from "@/app/api/check-schedules/[publicId]/route";
import { POST as create } from "@/app/api/check-schedules/route";
import { beforeEach, expect, it, vi } from "vitest";
import type { ScheduleSpend } from "./review-decision";
import { clearScheduleReviewSpentForTests } from "./review-permit";

const mocks = vi.hoisted(() => ({ load: vi.fn(), write: vi.fn(), record: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-schedule-review-key-0123456789")],
}));
vi.mock("./review-load", () => ({ loadScheduleSpend: mocks.load }));
vi.mock("./review-receipt", () => ({ consumeDurableScheduleReview: vi.fn() }));
vi.mock("@/lib/capacity/capacity-extension", () => ({
  prepareResourceCapacity: async () => ({ enabled: false }),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({ user: { id: "owner" } }) }));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: async () => ({ id: "owner", memberships: [] }),
  requireProjectScope: async () => ({ id: "project" }),
  ProjectNotFoundError: class extends Error {},
}));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: mocks.record }));
vi.mock("@/lib/api/admission-error-details", () => ({
  appAdmissionErrorDetails: async () => null,
}));
vi.mock("@/lib/rank-check/schedules/service", () => ({
  createSchedule: mocks.write,
  updateSchedule: mocks.write,
  deleteSchedule: mocks.write,
  CheckScheduleNotEmptyError: class extends Error {},
}));
vi.mock("@/lib/rank-check/schedules/service-membership", () => ({
  assignKeywordsToSchedule: mocks.write,
  removeKeywordsFromSchedule: mocks.write,
}));
vi.mock("./mutation-runs", () => ({
  setScheduleStateNow: mocks.write,
  assertScheduleTransition: vi.fn(),
}));
vi.mock("./current-state", () => ({ readScheduleState: async () => ({ state: "active" }) }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: async (run: (tx: object) => unknown) => run({}) },
}));
const projectId = "prj_a00000000000000000000000";
const scheduleId = "sch_a00000000000000000000000";
const context = { params: Promise.resolve({ publicId: scheduleId }) };
let spend: ScheduleSpend;
let revision: string;
beforeEach(() => {
  vi.clearAllMocks();
  clearScheduleReviewSpentForTests();
  revision = "1";
  const cadence = (frequency: "weekly" | "daily") => ({
    frequency,
    enabled: true,
    archived: false,
    publicId: scheduleId,
    cronExpression: null,
    jitterMinutes: 0,
    timeOfDay: null,
    timezone: "UTC",
    serpDepth: 20,
  });
  spend = {
    before: { cadence: cadence("weekly"), members: 1, unitCents: 1 },
    after: { cadence: cadence("daily"), members: 1, unitCents: 1 },
    manualToScheduled: false,
    now: new Date(),
    operation: "update",
    projectDepth: 20,
    providerAfter: null,
    providerBefore: null,
  };
  mocks.load.mockImplementation(async () => ({
    spend: structuredClone(spend),
    revision,
    guard: { kind: "none" },
  }));
  mocks.write.mockResolvedValue({ publicId: scheduleId, updated: 1, changed: true });
});
const cases = [
  {
    name: "archive and move",
    route: (request: Request) => archive(request, context),
    method: "POST",
    body: { projectId, destinationScheduleId: "sch_b00000000000000000000000" },
  },
  {
    name: "create",
    route: (request: Request) => create(request),
    method: "POST",
    body: { projectId, name: "Daily", frequency: "daily" },
  },
  {
    name: "edit",
    route: (request: Request) => update(request, context),
    method: "PATCH",
    body: { projectId, frequency: "daily" },
  },
  {
    name: "activate/resume",
    route: (request: Request) => update(request, context),
    method: "PATCH",
    body: { projectId, enabled: true },
  },
  {
    name: "assign",
    route: (request: Request) => assign(request, context),
    method: "POST",
    body: { projectId, keywordIds: ["kw_a00000000000000000000000"] },
  },
  {
    name: "remove",
    route: (request: Request) => remove(request, context),
    method: "DELETE",
    body: { projectId, keywordIds: ["kw_a00000000000000000000000"] },
  },
];
function request(method: string, body: object) {
  return new Request("https://example.com/api/check-schedules", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
it.each(cases)(
  "gates the internal $name route and attaches the next preview",
  async ({ route, method, body }) => {
    const missing = await route(request(method, body));
    expect(missing.status).toBe(428);
    const problem = await missing.json();
    expect(problem.errors).toMatchObject({
      code: "schedule_review_required",
      preview: { requires_review: true },
    });
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
    const preview = problem.errors.preview;
    const review = {
      preview_token: preview.preview_token,
      expected_revision: preview.expected_revision,
      window_start: preview.window_start,
    };
    revision = "2";
    const stale = await route(request(method, { ...body, review }));
    expect(stale.status).toBe(409);
    expect((await stale.json()).errors.preview.expected_revision).toBe("2");
    expect(mocks.write).not.toHaveBeenCalled();
    revision = "1";
    expect((await route(request(method, { ...body, review }))).status).toBe(200);
    expect(mocks.write).toHaveBeenCalledOnce();
    expect(mocks.record).toHaveBeenCalledOnce();
  },
);
it.each(cases)("preserves a no-review decrease on $name", async ({ route, method, body }) => {
  [spend.before, spend.after] = [spend.after, spend.before];
  expect((await route(request(method, body))).status).toBe(200);
  expect(mocks.write).toHaveBeenCalledOnce();
});
