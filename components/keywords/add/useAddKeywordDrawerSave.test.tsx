import { renderWithSharedMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAddKeywordDrawerSave } from "./useAddKeywordDrawerSave";

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  matrix: vi.fn(),
  batch: vi.fn(),
  close: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/schedules/preview-client", async (original) => ({
  ...(await original<typeof import("@/lib/schedules/preview-client")>()),
  requestScheduleChangePreview: mocks.preview,
}));
vi.mock("@/lib/actions/keyword", () => ({ addKeywordsMatrix: mocks.matrix }));

const preview = {
  requires_review: true,
  capacity: null,
  review_reasons: ["cost_increase"],
  preview_token: "first",
  expected_revision: "1",
  window_start: "2026-10-01T00:00:00.000Z",
  cost_before_cents: 0,
  cost_after_cents: 700,
};
const values = {
  projectId: "project",
  keywords: "rank tracker",
  tags: [],
  isPaused: false,
  device: "desktop" as const,
  location: "United States",
  schedule: {
    frequency: "daily" as const,
    timezone: "UTC",
    jitterMinutes: 0,
    cronExpression: null,
  },
};
function Harness({ mode }: { mode: "manual" | "csv" }) {
  const { save, dialog } = useAddKeywordDrawerSave({
    projectId: "project",
    activeTab: mode,
    addKeywordsAction: mocks.batch,
    checkScheduleId: null,
    csvText: "keyword\nrank tracker",
    devices: ["desktop"],
    existingKeywords: [],
    locationKeys: ["US"],
    locationValue: {
      kind: "country",
      countryCode: "US",
      displayName: "United States",
      canonicalKey: "US",
    },
    onClose: mocks.close,
    setActionError: mocks.error,
    setActionWarning: vi.fn(),
  });
  return (
    <>
      <input aria-label="Keywords" defaultValue="rank tracker" />
      <button type="button" onClick={() => void save(values)}>
        Save
      </button>
      {dialog}
    </>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.preview.mockResolvedValue(preview);
  mocks.matrix.mockResolvedValue({ created: 1 });
  mocks.batch.mockResolvedValue({ created: 1 });
});
for (const mode of ["manual", "csv"] as const)
  describe(`${mode} drawer save review`, () => {
    const action = () => (mode === "manual" ? mocks.matrix : mocks.batch);
    it("saves without a dialog when the preview needs no review", async () => {
      mocks.preview.mockResolvedValue({ ...preview, requires_review: false, preview_token: null });
      render(<Harness mode={mode} />);
      fireEvent.click(screen.getByText("Save"));
      await waitFor(() => expect(action()).toHaveBeenCalledOnce());
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(mocks.close).toHaveBeenCalledOnce();
    });
    it("confirms with the signed token", async () => {
      render(<Harness mode={mode} />);
      fireEvent.click(screen.getByText("Save"));
      const confirm = await screen.findByRole("button", { name: "Confirm" });
      expect(action()).not.toHaveBeenCalled();
      fireEvent.click(confirm);
      await waitFor(() =>
        expect(action()).toHaveBeenCalledWith(
          expect.objectContaining({ review: expect.objectContaining({ preview_token: "first" }) }),
        ),
      );
    });
    it("cancel preserves the drawer input without writing", async () => {
      render(<Harness mode={mode} />);
      fireEvent.click(screen.getByText("Save"));
      fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(action()).not.toHaveBeenCalled();
      expect(mocks.close).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Keywords")).toHaveValue("rank tracker");
    });
    it.each([409, 428])(
      "reopens fresh numbers after %s and waits for another confirmation",
      async (status) => {
        action().mockResolvedValueOnce({
          ok: false,
          error: {
            status,
            code: status === 409 ? "schedule_review_stale" : "schedule_review_required",
            message: "Changed",
            preview: { ...preview, cost_after_cents: 1400, preview_token: "fresh" },
          },
        });
        render(<Harness mode={mode} />);
        fireEvent.click(screen.getByText("Save"));
        fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
        expect(await screen.findByText("$14.00")).toBeVisible();
        expect(action()).toHaveBeenCalledOnce();
        fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
        await waitFor(() =>
          expect(action()).toHaveBeenLastCalledWith(
            expect.objectContaining({
              review: expect.objectContaining({ preview_token: "fresh" }),
            }),
          ),
        );
      },
    );
  });
