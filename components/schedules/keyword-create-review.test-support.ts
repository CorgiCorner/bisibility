import type { ScheduleChangePreview } from "@/lib/schedules/preview";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, type Mock } from "vitest";

export const createSpendPreview = {
  capacity: null,
  requires_review: true,
  review_reasons: ["cost_increase"],
  preview_token: "first",
  expected_revision: "1",
  window_start: "2026-11-14T00:00:00.000Z",
  cost_before_cents: 0,
  cost_after_cents: 700,
} as ScheduleChangePreview;
type Caller = { action: Mock; start: () => Promise<void>; assertDraft: () => void };
export function keywordCreateReviewCases(
  name: string,
  preview: Mock,
  mount: () => Promise<Caller>,
) {
  describe(name, () => {
    beforeEach(() => preview.mockResolvedValue(createSpendPreview));
    it("no review writes once without showing the spend dialog", async () => {
      preview.mockResolvedValue({
        ...createSpendPreview,
        requires_review: false,
        preview_token: null,
      });
      const c = await mount();
      await c.start();
      await waitFor(() => expect(c.action).toHaveBeenCalledOnce());
      expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    });
    it("confirms with the signed token before any write", async () => {
      const c = await mount();
      await c.start();
      const confirm = await screen.findByRole("button", { name: "Confirm" });
      expect(c.action).not.toHaveBeenCalled();
      fireEvent.click(confirm);
      await waitFor(() =>
        expect(c.action).toHaveBeenCalledWith(
          expect.objectContaining({ review: expect.objectContaining({ preview_token: "first" }) }),
        ),
      );
    });
    it("cancel preserves the caller state and performs no mutation", async () => {
      const c = await mount();
      await c.start();
      const confirm = await screen.findByRole("button", { name: "Confirm" });
      const dialog = confirm.closest('[role="dialog"]');
      if (!dialog) throw new Error("Missing spend dialog");
      const cancel = [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Cancel");
      if (!cancel) throw new Error("Missing Cancel action");
      fireEvent.click(cancel);
      await waitFor(() => expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull());
      expect(c.action).not.toHaveBeenCalled();
      c.assertDraft();
    });
    it.each([409, 428])(
      "%s reopens the new numbers and requires explicit confirmation",
      async (status) => {
        const c = await mount();
        c.action.mockResolvedValueOnce({
          ok: false,
          error: {
            status,
            code: status === 409 ? "schedule_review_stale" : "schedule_review_required",
            message: "Changed",
            preview: { ...createSpendPreview, cost_after_cents: 1400, preview_token: "fresh" },
          },
        });
        await c.start();
        fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
        expect(await screen.findByText("$14.00")).toBeVisible();
        expect(c.action).toHaveBeenCalledOnce();
        fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
        await waitFor(() =>
          expect(c.action).toHaveBeenLastCalledWith(
            expect.objectContaining({
              review: expect.objectContaining({ preview_token: "fresh" }),
            }),
          ),
        );
      },
    );
  });
}
