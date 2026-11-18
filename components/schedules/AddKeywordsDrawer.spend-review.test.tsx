import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AddKeywordsDrawer } from "./AddKeywordsDrawer";

const mock = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock("@/lib/schedules/preview-client", async (original) => ({
  ...(await original<typeof import("@/lib/schedules/preview-client")>()),
  requestScheduleChangePreview: mock.preview,
}));
it("reviews adding or moving existing members through the shared hook", async () => {
  mock.preview.mockResolvedValue({
    capacity: null,
    requires_review: true,
    review_reasons: ["manual_to_scheduled"],
    cost_before_cents: 0,
    cost_after_cents: 700,
    preview_token: "token",
    expected_revision: "1",
    window_start: "2026-10-01T00:00:00.000Z",
  });
  const assign = vi.fn(async () => ({ updated: 1 }));
  render(
    <AddKeywordsDrawer
      assignKeywordsAction={assign}
      open
      onClose={vi.fn()}
      projectId="prj_story"
      scheduleId="sch_story"
      scheduleName="Daily"
      initialSelectedKeywordIds={["kw_story"]}
      candidates={[
        {
          id: "kw_story",
          keyword: "example",
          device: "desktop",
          market: "US",
          checks: 1,
          tags: [],
        },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Add 1 keyword/ }));
  expect(await screen.findByRole("button", { name: "Confirm" })).toBeVisible();
  expect(assign).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(assign).toHaveBeenCalledOnce());
  expect(assign).toHaveBeenCalledWith(
    expect.objectContaining({ review: expect.objectContaining({ preview_token: "token" }) }),
  );
});
