import type { StoredResultsIndexEntry } from "@/lib/checks/contract";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RetrievedResultsPicker, storedCheckLabel } from "./RetrievedResultsPicker";

function item(
  checkId: string,
  checkedAt: string,
  position: number | null,
  tier: StoredResultsIndexEntry["tier"],
  retrievedPositions: number | null,
): StoredResultsIndexEntry {
  return {
    checkId,
    checkedAt,
    degradedToCountry: false,
    fullDetailUntil: null,
    position,
    provider: "provider",
    providerLabel: "Provider",
    requestedDepth: 100,
    retrievedPositions,
    stoppedAtResult: tier === "full",
    tier,
  };
}
const entries = [
  item("mar12", "2026-03-12T06:00:00Z", 4, "full", 8),
  item("mar05", "2026-03-05T06:00:00Z", 6, "full", 8),
  item("feb26", "2026-02-26T06:00:00Z", 7, "full", 8),
  item("jan04", "2026-01-04T06:00:00Z", 9, "compact", 3),
  item("dec12", "2025-12-12T06:00:00Z", 11, "none", null),
];
const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(iso));
const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));

describe("RetrievedResultsPicker", () => {
  it("labels full, compact and none entries in retained-data language", () => {
    expect(storedCheckLabel(entries[1] as StoredResultsIndexEntry, formatDateTime)).toBe(
      "5 Mar 2026, 06:00 · top 8 kept",
    );
    expect(storedCheckLabel(entries[3] as StoredResultsIndexEntry, formatDateTime)).toBe(
      "4 Jan 2026, 06:00 · top 3 kept",
    );
    expect(storedCheckLabel(entries[4] as StoredResultsIndexEntry, formatDateTime)).toBe(
      "12 Dec 2025, 06:00 · not kept",
    );
  });

  it("renders TO recent checks with disabled reasons, selection, and constrained jump", () => {
    const onChange = vi.fn();
    render(
      <RetrievedResultsPicker
        ariaLabel="Later check"
        entries={entries}
        formatDate={formatDate}
        formatDateTime={formatDateTime}
        onChange={onChange}
        pickerRole="to"
        selectedFrom="mar05"
        value="mar12"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Later check" }));
    const menu = screen.getByRole("menu", { name: "Later check" });
    expect(within(menu).getByText("Recent checks")).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: /12 Mar 2026, 06:00 #4 top 8 kept selected/ }),
    ).toHaveAttribute("aria-current", "true");
    const from = within(menu).getByRole("menuitem", {
      name: /5 Mar 2026, 06:00 #6 top 8 kept selected as From/,
    });
    const earlier = within(menu).getByRole("menuitem", {
      name: /26 Feb 2026, 06:00 #7 top 8 kept earlier than From/,
    });
    const purged = within(menu).getByRole("menuitem", {
      name: /12 Dec 2025, 06:00 #11 not kept purged by retention/,
    });
    expect(from).toHaveAttribute("aria-disabled", "true");
    expect(earlier).toHaveAttribute("aria-disabled", "true");
    expect(purged).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(from);
    expect(onChange).not.toHaveBeenCalled();
    expect(within(menu).getByText("Jump to date")).toBeInTheDocument();
    expect(
      within(menu).getByText("Picks the closest comparable loaded check."),
    ).toBeInTheDocument();
    fireEvent.change(within(menu).getByLabelText("Jump to date"), {
      target: { value: "2026-02-01" },
    });
    expect(onChange).toHaveBeenCalledWith("mar12");
  });

  it("renders FROM presets relative to TO and disables invalid recent checks", () => {
    const onChange = vi.fn();
    render(
      <RetrievedResultsPicker
        ariaLabel="Earlier check"
        entries={entries}
        formatDate={formatDate}
        formatDateTime={formatDateTime}
        onChange={onChange}
        pickerRole="from"
        selectedTo="mar12"
        value="feb26"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Earlier check" }));
    const menu = screen.getByRole("menu", { name: "Earlier check" });
    expect(within(menu).getByText("Compare with · relative to 12 Mar 2026")).toBeInTheDocument();
    const previous = within(menu).getByRole("menuitem", {
      name: /Previous check #6 5 Mar 2026 · top 8 kept/,
    });
    expect(previous).toBeEnabled();
    expect(
      within(menu).getByRole("menuitem", { name: /30 days ago #7 26 Feb 2026 · top 8 kept/ }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: /90 days ago #9 4 Jan 2026 · top 3 kept/ }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", {
        name: /12 Mar 2026, 06:00 #4 top 8 kept selected as To/,
      }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      within(menu).getByRole("menuitem", { name: /26 Feb 2026, 06:00 #7 top 8 kept selected/ }),
    ).toHaveAttribute("aria-current", "true");
    fireEvent.click(previous);
    expect(onChange).toHaveBeenCalledWith("mar05");
  });
});
