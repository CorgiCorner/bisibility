import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SetScheduleModal } from "./SetScheduleModal";

const mock = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock("@/lib/schedules/preview-client", async (original) => ({
  ...(await original<typeof import("@/lib/schedules/preview-client")>()),
  requestScheduleChangePreview: mock.preview,
}));
it("creates empty, reviews member assignment, and leaves the empty schedule on cancel", async () => {
  const quote = {
    capacity: null,
    requires_review: false,
    review_reasons: [],
    cost_before_cents: 0,
    cost_after_cents: 0,
    preview_token: null,
    expected_revision: "1",
    window_start: "2026-10-01T00:00:00.000Z",
  };
  mock.preview.mockResolvedValueOnce(quote).mockResolvedValue({
    ...quote,
    requires_review: true,
    preview_token: "token",
    review_reasons: ["cost_increase"],
    cost_after_cents: 700,
  });
  const fetchMock = vi.fn(
    async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ data: { publicId: "sch_story" } })),
  );
  const done = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  render(
    <SetScheduleModal
      initialView="new"
      onClose={vi.fn()}
      onDone={done}
      open
      projectId="prj_story"
      schedules={[]}
      selectedRows={[keywordRows[0]]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Create schedule" }));
  expect(await screen.findByRole("button", { name: "Confirm" })).toBeVisible();
  expect(screen.getAllByText(/The empty schedule has been created/).length).toBeGreaterThan(0);
  expect(fetchMock).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull());
  expect(done).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(mock.preview.mock.calls[0][0].change.op).toBe("create");
  expect(mock.preview.mock.calls[1][0].change).toMatchObject({
    op: "update",
    id: "sch_story",
    body: {
      kind: "rank-membership",
      operation: "assign",
      membership: { keywordIds: [keywordRows[0].id] },
    },
  });
});
