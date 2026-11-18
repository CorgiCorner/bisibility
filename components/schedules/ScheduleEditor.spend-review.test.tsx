import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ScheduleEditor } from "./ScheduleEditor";

const mock = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock("@/lib/schedules/preview-client", async (original) => ({
  ...(await original<typeof import("@/lib/schedules/preview-client")>()),
  requestScheduleChangePreview: mock.preview,
}));
const review = {
  capacity: null,
  requires_review: true,
  review_reasons: ["cost_increase"],
  cost_before_cents: 100,
  cost_after_cents: 700,
  preview_token: "token",
  expected_revision: "1",
  window_start: "2026-10-01T00:00:00.000Z",
};
beforeEach(() => {
  vi.clearAllMocks();
  mock.preview.mockResolvedValue(review);
});
it("reviews the rank editor save through the shared hook", async () => {
  const fetchMock = vi.fn(
    async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ data: { publicId: "sch_story" } })),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <ScheduleEditor
      connectedProviders={[]}
      projectId="project"
      projectDefaults={{ provider: { value: "dataforseo", label: "DataForSEO" }, serpDepth: 20 }}
      projectTimezone="UTC"
      schedule={{
        publicId: "sch_story",
        name: "Daily",
        frequency: "daily",
        enabled: true,
        jitterMinutes: 0,
        keywordCount: 1,
        cronExpression: null,
        providerPolicy: null,
        serpDepth: null,
        timeOfDay: null,
        timezone: "UTC",
      }}
    />,
  );
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Renamed" } });
  fireEvent.click(screen.getByRole("button", { name: "Save schedule" }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({
    review: { preview_token: "token" },
  });
  expect(mock.preview).toHaveBeenCalledWith(
    expect.objectContaining({ change: expect.objectContaining({ op: "update", id: "sch_story" }) }),
  );
});
