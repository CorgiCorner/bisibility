import { beforeEach, expect, it, vi } from "vitest";
import { mutateAiTrackingAction } from "./ai-tracking";

const mocks = vi.hoisted(() => ({ preview: vi.fn(), write: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./_shared", () => ({ getActionActor: async () => ({ id: "owner", memberships: [] }) }));
vi.mock("./ai-tracking-input", () => ({
  stampAppScheduleInput: (input: object) => ({ ...input, entrySource: "app" }),
}));
vi.mock("@/lib/api/ai-tracking-service", () => ({
  trackingScope: async () => ({ id: "project" }),
}));
vi.mock("@/lib/schedules/preview", () => ({ previewScheduleChange: mocks.preview }));
vi.mock("@/lib/schedules/mutations", () => ({ mutateAiSchedule: mocks.write }));
beforeEach(() => vi.clearAllMocks());
it("classifies the refusal preview from the original pause before stamping", async () => {
  const { ScheduleReviewRequiredError } = await import("@/lib/schedules/errors");
  mocks.write.mockRejectedValue(new ScheduleReviewRequiredError());
  mocks.preview.mockResolvedValue({ requires_review: false });
  await expect(
    mutateAiTrackingAction("prj_story", "schedules", "PATCH", { enabled: false }, "ais_story"),
  ).resolves.toMatchObject({ error: { code: "schedule_review_required" } });
  expect(mocks.write.mock.calls[0][3]).toEqual({ enabled: false, entrySource: "app" });
  expect(mocks.preview).toHaveBeenCalledWith("project", expect.any(Object), {
    op: "state",
    id: "ais_story",
    state: "paused",
    command: { kind: "ai" },
  });
});

it.each(["POST", "PATCH"] as const)(
  "keeps stamped %s configuration in the refusal preview binding",
  async (method) => {
    const { ScheduleReviewRequiredError } = await import("@/lib/schedules/errors");
    mocks.write.mockRejectedValue(new ScheduleReviewRequiredError());
    mocks.preview.mockResolvedValue({ requires_review: true });
    const input = { configuration: { promptIds: [] } };
    await mutateAiTrackingAction("prj_story", "schedules", method, input, "ais_story");
    expect(mocks.preview).toHaveBeenCalledWith(
      "project",
      expect.any(Object),
      expect.objectContaining({
        body: { kind: "ai", input: { ...input, entrySource: "app" } },
      }),
    );
  },
);
