import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AsOfDatePopover } from "./AsOfDatePopover";

const now = new Date("2026-07-24T10:00:00.000Z");

function Harness({ onSelect = vi.fn() }: Readonly<{ onSelect?: (date: string) => void }>) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  return (
    <>
      <button
        aria-expanded={Boolean(anchorEl)}
        aria-haspopup="dialog"
        onClick={(event) => setAnchorEl(event.currentTarget)}
        type="button"
      >
        As of: Jul 17, 2026
      </button>
      <AsOfDatePopover
        anchorEl={anchorEl}
        now={now}
        onClose={() => setAnchorEl(null)}
        onSelect={onSelect}
        selectedDate="2026-07-17"
        timeZone="UTC"
      />
    </>
  );
}

describe("AsOfDatePopover", () => {
  it("shows the current as-of date, selects a new one, closes, and restores focus", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSelect={onSelect} />);
    const trigger = screen.getByRole("button", { name: "As of: Jul 17, 2026" });

    await user.click(trigger);
    const popover = screen.getByRole("dialog", { name: "As of date" });
    expect(within(popover).getByText("Dates use the project timezone (UTC).")).toBeInTheDocument();
    expect(within(popover).getByRole("button", { name: "July 17, 2026" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(within(popover).getByRole("button", { name: "July 20, 2026" }));

    expect(onSelect).toHaveBeenCalledWith("2026-07-20");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "As of date" })).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });

  it("opens from the keyboard and closes with Escape or an outside click", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "As of: Jul 17, 2026" });

    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "As of date" })).toBeVisible();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.keyboard(" ");
    expect(screen.getByRole("dialog", { name: "As of date" })).toBeVisible();
    const backdrop = document.querySelector(".MuiBackdrop-root");
    expect(backdrop).toBeInstanceOf(HTMLElement);
    fireEvent.click(backdrop as HTMLElement);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "As of date" })).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });
});
