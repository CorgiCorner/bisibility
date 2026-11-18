import type { ScheduleChange } from "@/lib/schedules/preview";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stampAppScheduleInput } from "./ai-tracking-input";
import { previewScheduleChangeAction } from "./schedule-review";

const mocks = vi.hoisted(() => ({
  getActionActor: vi.fn(),
  preview: vi.fn(),
  requireProjectScope: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./_shared", () => ({
  getActionActor: mocks.getActionActor,
  requireProjectScope: mocks.requireProjectScope,
}));
vi.mock("@/lib/schedules/preview", () => ({ previewScheduleChange: mocks.preview }));

const actor = { id: "user_1", memberships: [] };
const projectId = "prj_a00000000000000000000000";
const preview = { expected_revision: "4", preview_token: null, requires_review: false };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActionActor.mockResolvedValue(actor);
  mocks.requireProjectScope.mockResolvedValue({ id: "project_1", publicId: projectId });
  mocks.preview.mockResolvedValue(preview);
});

describe("previewScheduleChangeAction", () => {
  it.each([
    [
      "rank update",
      {
        body: {
          input: {
            projectId: "prj_a00000000000000000000000",
            scheduleId: "sch_a00000000000000000000000",
          },
          kind: "rank",
        },
        id: "sch_a00000000000000000000000",
        op: "update",
      },
      "update",
      "check_schedule",
    ],
    [
      "keyword assign",
      {
        keywordIds: ["kw_a00000000000000000000000"],
        op: "keywords",
        scheduleId: "sch_a00000000000000000000000",
      },
      "update",
      "check_schedule",
    ],
    [
      "local monitor resume",
      {
        command: { kind: "local_monitor" },
        id: "mon_a00000000000000000000000",
        op: "state",
        state: "active",
      },
      "update",
      "local_measurement_run",
    ],
    [
      "rank delete",
      { id: "sch_a00000000000000000000000", op: "delete" },
      "manage",
      "check_schedule",
    ],
    [
      "ai create",
      {
        body: { input: { configuration: { promptIds: [] } }, kind: "ai" },
        op: "create",
      },
      "update",
      "project",
    ],
    [
      "data sync pause",
      {
        command: { kind: "data_sync", syncKind: "domain_rating" },
        id: "domain_rating",
        op: "state",
        state: "paused",
      },
      "manage",
      "provider_connection",
    ],
  ] as const)("authorizes %s like its mutation", async (_name, change, action, type) => {
    const result = await previewScheduleChangeAction({
      change: change as ScheduleChange,
      projectId,
    });
    expect(mocks.requireProjectScope).toHaveBeenCalledWith(actor, action, projectId, { type });
    const expected =
      change.op === "create" && change.body.kind === "ai"
        ? {
            ...change,
            body: { ...change.body, input: stampAppScheduleInput(change.body.input, actor.id) },
          }
        : change;
    expect(mocks.preview).toHaveBeenCalledWith("project_1", actor, expected);
    expect(result).toBe(preview);
  });

  it("does not preview when the project scope is refused", async () => {
    mocks.requireProjectScope.mockRejectedValue(new Error("forbidden"));
    await expect(
      previewScheduleChangeAction({
        change: { id: "sch_a00000000000000000000000", op: "delete" },
        projectId,
      }),
    ).rejects.toThrow("forbidden");
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("rejects an ai create that omits configuration before previewing it", async () => {
    await expect(
      previewScheduleChangeAction({
        change: { body: { kind: "ai" }, op: "create" } as ScheduleChange,
        projectId,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "schedule_review_invalid" } });
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("rejects a rank update that omits input before previewing it", async () => {
    await expect(
      previewScheduleChangeAction({
        change: {
          body: { kind: "rank" },
          id: "sch_a00000000000000000000000",
          op: "update",
        } as ScheduleChange,
        projectId,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "schedule_review_invalid" } });
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it("rejects an input that does not match the schedule change schema", async () => {
    await expect(
      previewScheduleChangeAction({
        change: { op: "update" } as ScheduleChange,
        projectId,
      }),
    ).resolves.toMatchObject({ ok: false });
    expect(mocks.preview).not.toHaveBeenCalled();
  });
});

it.each(["create", "update", "membership"])(
  "returns the first validation message for invalid %s",
  async (kind) => {
    const { createCheckScheduleSchema, updateCheckScheduleSchema, checkScheduleMembershipSchema } =
      await import("@/lib/schemas/check-schedule");
    const invalid = {
      projectId,
      scheduleId: "sch_a00000000000000000000000",
      name: "",
      keywordIds: [],
    };
    const schema =
      kind === "create"
        ? createCheckScheduleSchema
        : kind === "update"
          ? updateCheckScheduleSchema
          : checkScheduleMembershipSchema;
    const parsed = schema.safeParse(invalid);
    if (parsed.success) throw new Error("Invalid fixture required.");
    const change =
      kind === "create"
        ? { op: "create", body: { kind: "rank", input: invalid } }
        : {
            op: "update",
            id: invalid.scheduleId,
            body:
              kind === "update"
                ? { kind: "rank", input: invalid }
                : { kind: "rank-membership", operation: "assign", membership: invalid },
          };
    await expect(
      previewScheduleChangeAction({ projectId, change: change as ScheduleChange }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "schedule_review_invalid",
        status: 422,
        message: parsed.error.issues[0].message,
      },
    });
    expect(mocks.preview).not.toHaveBeenCalled();
  },
);

import { marketCreateChange } from "@/lib/markets/create-review-change";

it("requires the market writer's permission for a server-resolved market preview", async () => {
  const change = marketCreateChange({
    projectId,
    canonicalKey: "US",
    countryCode: "US",
    languageCode: "en",
    kind: "country",
    devices: ["desktop"],
    method: { kind: "empty" },
  });
  expect(await previewScheduleChangeAction({ projectId, change })).toEqual(preview);
  expect(mocks.requireProjectScope).toHaveBeenCalledWith(actor, "create", projectId, {
    type: "project_market",
  });
  mocks.requireProjectScope.mockRejectedValueOnce(new Error("forbidden"));
  mocks.preview.mockClear();
  await expect(previewScheduleChangeAction({ projectId, change })).rejects.toThrow("forbidden");
  expect(mocks.preview).not.toHaveBeenCalled();
});

it.each([
  ["resume", "update"],
  ["restore", "delete"],
  ["add", "create"],
] as const)("market %s preview uses the mutation permission", async (mode, action) => {
  const change = {
    op: "market-reactivate" as const,
    marketIds: ["pmkt_a00000000000000000000000"],
    mode,
  };
  expect(await previewScheduleChangeAction({ projectId, change })).toEqual(preview);
  expect(mocks.requireProjectScope).toHaveBeenCalledWith(actor, action, projectId, {
    type: "project_market",
  });
  mocks.requireProjectScope.mockRejectedValueOnce(new Error("forbidden"));
  mocks.preview.mockClear();
  await expect(previewScheduleChangeAction({ projectId, change })).rejects.toThrow("forbidden");
  expect(mocks.preview).not.toHaveBeenCalled();
});
