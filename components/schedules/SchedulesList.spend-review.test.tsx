import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { SchedulesList } from "./SchedulesList";

const mock = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock("@/lib/schedules/preview-client", async (original) => ({
  ...(await original<typeof import("@/lib/schedules/preview-client")>()),
  requestScheduleChangePreview: mock.preview,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mock.preview.mockResolvedValue({
    capacity: null,
    requires_review: true,
    review_reasons: ["cost_increase"],
    cost_before_cents: 0,
    cost_after_cents: 700,
    preview_token: "token",
    expected_revision: "1",
    window_start: "2026-10-01T00:00:00.000Z",
  });
});
it("reviews activation from the list through the shared flow", async () => {
  const fetchMock = vi.fn(
    async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ data: { publicId: "schedule" } })),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <SchedulesList
      canUpdate
      canManage
      projectId="prj_story"
      projectRef="prj_story"
      schedules={[
        {
          publicId: "schedule",
          name: "Weekly",
          enabled: false,
          frequency: "weekly",
          keywordCount: 2,
          targetCount: 2,
          memberDeviceCount: 1,
          memberMarketCount: 1,
          perRunCents: 1,
          nextRunAt: null,
          timeOfDay: null,
          timezone: "UTC",
        },
      ]}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /activate|resume/i }));
  expect(await screen.findByRole("dialog")).toBeVisible();
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  expect(mock.preview).toHaveBeenCalledWith(
    expect.objectContaining({ change: expect.objectContaining({ op: "state", state: "active" }) }),
  );
});

it("ignores a second row toggle without clearing the first pending row", async () => {
  vi.stubGlobal("fetch", vi.fn());
  render(
    <SchedulesList
      canUpdate
      projectId="prj_story"
      projectRef="prj_story"
      schedules={["A", "B"].map((name) => ({
        publicId: `sch_${name}`,
        name,
        enabled: false,
        frequency: "weekly",
        keywordCount: 2,
        timeOfDay: null,
        timezone: "UTC",
        nextRunAt: null,
      }))}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Resume A" }));
  expect(await screen.findByRole("dialog")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Resume B", hidden: true }));
  await waitFor(() => expect(mock.preview).toHaveBeenCalledOnce());
  // Let the rejected concurrent call settle before checking row A.
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.getByRole("button", { name: "Resume A", hidden: true })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Resume A" })).toBeEnabled());
});
