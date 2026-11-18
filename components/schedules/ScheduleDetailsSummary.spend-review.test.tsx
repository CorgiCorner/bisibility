import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ScheduleDetailsSummary } from "./ScheduleDetailsSummary";

const mock = vi.hoisted(() => ({ preview: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/schedules/preview-client", async (original) => ({
  ...(await original<typeof import("@/lib/schedules/preview-client")>()),
  requestScheduleChangePreview: mock.preview,
}));
const quote = {
  capacity: null,
  requires_review: true,
  review_reasons: ["cost_increase"],
  cost_before_cents: 0,
  cost_after_cents: 700,
  preview_token: "token",
  expected_revision: "1",
  window_start: "2026-10-01T00:00:00.000Z",
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.preview.mockResolvedValue(quote);
  mock.fetch.mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", mock.fetch);
});
function show(enabled = false) {
  const schedule = {
    publicId: "sch_story",
    name: "Weekly",
    frequency: "weekly" as const,
    enabled,
    keywordCount: 2,
    timeOfDay: null,
    timezone: "UTC",
    nextRunAt: null,
  };
  render(
    <ScheduleDetailsSummary
      canEdit
      canManage
      projectId="prj_story"
      schedule={schedule}
      schedules={[schedule]}
    />,
  );
}
it.each(["Confirm", "Cancel"])("reviews details resume before %s", async (decision) => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Resume" }));
  expect(await screen.findByRole("dialog")).toBeVisible();
  expect(mock.fetch).not.toHaveBeenCalled();
  expect(mock.preview).toHaveBeenCalledWith({
    projectId: "prj_story",
    change: {
      op: "state",
      id: "sch_story",
      state: "active",
      command: { kind: "rank", projectPublicId: "prj_story" },
    },
  });
  fireEvent.click(screen.getByRole("button", { name: decision }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  if (decision === "Cancel") expect(mock.fetch).not.toHaveBeenCalled();
  else {
    expect(mock.fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(mock.fetch.mock.calls[0][1].body)).toEqual({
      enabled: true,
      projectId: "prj_story",
      review: { preview_token: "token", expected_revision: "1", window_start: quote.window_start },
    });
  }
});
it("previews a pause and writes without opening review", async () => {
  mock.preview.mockResolvedValue({ ...quote, requires_review: false, preview_token: null });
  show(true);
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  await waitFor(() => expect(mock.fetch).toHaveBeenCalledOnce());
  expect(mock.preview).toHaveBeenCalledWith(
    expect.objectContaining({ change: expect.objectContaining({ state: "paused" }) }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});
