import { setNavigationState } from "@/tests/next-navigation";
import { stubResizeObserver } from "@/tests/observers";
import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { groupedPendingRows, pendingRows, renderPendingGrid } from "./KeywordsGrid.test-helpers";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setNavigationState({ pathname: "/app/prj_1/rank-tracker" });
  stubResizeObserver();
});

describe("Rank Tracker inline devices", () => {
  it("puts accessible device icons before keyword links in a mixed current view", async () => {
    const rows = pendingRows(2).map((row, index) => ({
      ...row,
      device: index ? "Mobile" : "Desktop",
    }));
    renderPendingGrid({ rows });
    await screen.findByText(rows[0].keyword);
    for (const [index, label] of ["Desktop", "Mobile"].entries()) {
      const row = screen.getByText(rows[index].keyword).closest('[role="row"]') as HTMLElement;
      const icon = within(row).getByRole("img", { name: label });
      const link = within(row).getByRole("link", { name: rows[index].keyword });
      expect(icon.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: "Device" })).not.toBeInTheDocument();
  });
  it("keeps icons on a desktop-only page when filtered view metadata includes mobile", async () => {
    const rows = pendingRows(2).map((row) => ({ ...row, device: "Desktop" }));
    renderPendingGrid({ rows, viewDevices: ["desktop", "mobile"] });
    await screen.findByText(rows[0].keyword);
    expect(screen.getAllByRole("img", { name: "Desktop" })).toHaveLength(2);
  });
  it("does not clutter a single-device view even when the project tracks other devices", async () => {
    const rows = pendingRows(2).map((row) => ({ ...row, device: "Mobile" }));
    renderPendingGrid({ rows });
    await screen.findByText(rows[0].keyword);
    expect(screen.queryByRole("img", { name: "Mobile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Desktop" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Device" })).not.toBeInTheDocument();
  });
  it("shows both devices for a mixed parent rather than pretending it is desktop", async () => {
    const rows = groupedPendingRows();
    renderPendingGrid({ rows });
    await screen.findByText(rows[0].keyword);
    const parent = screen.getByText(rows[0].keyword).closest('[role="row"]') as HTMLElement;
    expect(within(parent).getByRole("img", { name: "Desktop and Mobile" })).toBeVisible();
    expect(within(parent).queryByRole("img", { name: "Desktop" })).not.toBeInTheDocument();
  });
});
