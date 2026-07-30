import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BacklinksTable, type BacklinksTableProps } from "./BacklinksTable";
import { emptyBacklinksFilters } from "./backlinks-filters-model";
import { backlinksSnapshotFixture } from "./backlinks-fixtures";

const now = new Date("2026-07-24T12:00:00.000Z");
let exportedBlob: Blob | undefined;

function renderTable(overrides: Partial<BacklinksTableProps> = {}) {
  return render(
    <BacklinksTable
      fetchedRowCount={backlinksSnapshotFixture.fetchedRowCount}
      now={now}
      rows={backlinksSnapshotFixture.rows}
      target={backlinksSnapshotFixture.target}
      totalDomains={backlinksSnapshotFixture.summary.referringDomainsTotal}
      totalRowsAvailable={backlinksSnapshotFixture.totalRowsAvailable}
      {...overrides}
    />,
  );
}

function filtersButton() {
  return screen.getByRole("button", { name: /^Filters \d+$/ });
}

beforeEach(() => {
  exportedBlob = undefined;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn((blob: Blob) => {
      exportedBlob = blob;
      return "blob:backlinks";
    }),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

describe("Backlinks filters drawer", () => {
  it("opens and closes from the button and X, then returns focus", async () => {
    const user = userEvent.setup();
    renderTable();
    const trigger = filtersButton();

    await user.click(trigger);
    expect(screen.getByText("Filters", { selector: "h2 *" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close sheet" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Close sheet" })).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it("closes from the scrim and Escape without applying draft changes", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(filtersButton());
    await user.type(screen.getByLabelText("Exclude domain"), "toolindex.app");
    expect(screen.getByText("toolindex.app")).toBeInTheDocument();
    fireEvent.click(document.querySelector(".MuiBackdrop-root") as Element);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Close sheet" })).toBeNull());
    expect(screen.getByText("toolindex.app")).toBeInTheDocument();

    await user.click(filtersButton());
    await user.type(screen.getByLabelText("Exclude domain"), "toolindex.app");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Close sheet" })).toBeNull());
    expect(screen.getByText("toolindex.app")).toBeInTheDocument();
  });

  it("traps focus inside the drawer", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(filtersButton());
    const clear = screen.getByRole("button", { name: "Clear all" });
    const apply = screen.getByRole("button", { name: "Show 7 domains" });

    apply.focus();
    await user.tab();
    expect(clear).toHaveFocus();
    await user.tab({ shift: true });
    expect(apply).toHaveFocus();
  });

  it("keeps draft filters unapplied until the CTA and updates the badge and table", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(filtersButton());
    await user.type(screen.getByLabelText("Exclude domain"), "toolindex.app");
    expect(screen.getByRole("button", { name: "Show 6 domains" })).toBeInTheDocument();
    expect(screen.getByText("toolindex.app")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show 6 domains" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Close sheet" })).toBeNull());
    expect(filtersButton()).toHaveAccessibleName("Filters 1");
    expect(screen.queryByText("toolindex.app")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 6 of 48 domains")).toBeInTheDocument();
  });

  it("keeps Reset and Clear all in draft state until apply", async () => {
    const user = userEvent.setup();
    renderTable({
      initialAdvancedFilters: {
        ...emptyBacklinksFilters,
        domainAuthority: [50, 100],
        spamScore: [0, 7],
      },
    });
    const trigger = filtersButton();
    expect(trigger).toHaveAccessibleName("Filters 2");

    await user.click(trigger);
    await user.type(screen.getByLabelText("Anchor contains"), "review");
    expect(screen.getByText("3", { selector: "h2 span span" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("0", { selector: "h2 span span" })).toBeInTheDocument();
    expect(trigger).toHaveAccessibleName("Filters 2");

    await user.click(screen.getByRole("button", { name: "Close sheet" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Close sheet" })).toBeNull());
    await user.click(trigger);
    expect(screen.getByText("2", { selector: "h2 span span" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByText("0", { selector: "h2 span span" })).toBeInTheDocument();
    expect(trigger).toHaveAccessibleName("Filters 2");
  });

  it("exports only the rows left by the combined filters", async () => {
    const user = userEvent.setup();
    renderTable({ initialFilter: "new" });

    await user.click(filtersButton());
    await user.type(screen.getByLabelText("Exclude domain"), "reddit.com");
    await user.click(screen.getByRole("button", { name: "Show 2 domains" }));
    expect(screen.queryByText("reddit.com")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 2 of 3 domains")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("menuitem", { name: "Export CSV" }));

    expect(exportedBlob).toBeDefined();
    const csv = await exportedBlob?.text();
    expect(csv).toContain("producthunt.com");
    expect(csv).toContain("deskreview.io");
    expect(csv).not.toContain("reddit.com");
  });
});
