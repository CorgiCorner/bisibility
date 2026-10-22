import { renderWithProjectMarketsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { MarketsPageRow } from "@/lib/markets/page-model";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MarketDeviceSheet } from "./MarketDeviceSheet";

it("places Review and the explicit Add beside Cancel in the actual sheet footer", async () => {
  const onClose = vi.fn();
  const onAdded = vi.fn();
  const actions = {
    preview: vi.fn().mockResolvedValue({
      outcome: "ready",
      fingerprint: "a".repeat(64),
      keywordCount: 2,
      newCheckCount: 2,
      existingCount: 0,
      archivedCount: 0,
      scheduleName: null,
    }),
    add: vi.fn().mockResolvedValue({ outcome: "created", created: 2 }),
  };
  const market = {
    id: `pmkt_${"a".repeat(24)}`,
    name: "US English",
    status: "active",
    trackedDevices: ["desktop"],
  } as MarketsPageRow;
  render(
    <MarketDeviceSheet
      market={market}
      projectId={`prj_${"b".repeat(24)}`}
      actions={actions}
      schedules={[]}
      onClose={onClose}
      onAdded={onAdded}
    />,
  );
  const cancel = screen.getByRole("button", { name: "Cancel" });
  const review = await screen.findByRole("button", { name: "Review changes" });
  expect(review).toHaveAttribute("data-variant", "primary");
  expect(cancel).toHaveAttribute("data-size", "sm");
  expect(cancel.parentElement).toHaveClass("flex", "items-center");
  expect(review.closest("footer")).not.toBeNull();
  expect(review.closest("footer")).toBe(cancel.closest("footer"));
  fireEvent.click(review);
  const add = await screen.findByRole("button", { name: "Add Mobile tracking (2)" });
  expect(add.closest("footer")).toBe(cancel.closest("footer"));
  expect(screen.getAllByRole("button", { name: "Add Mobile tracking (2)" })).toHaveLength(1);
  expect(actions.add).not.toHaveBeenCalled();
  fireEvent.click(add);
  await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(onAdded).toHaveBeenCalledOnce();
});
