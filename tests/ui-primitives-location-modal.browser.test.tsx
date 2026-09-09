/// <reference types="vite/client" />
import "@/app/globals.css";
import { LocationField } from "@/components/keywords/LocationField";
import { countryValueForName } from "@/components/keywords/location-picker-data";
import { AnchoredList } from "@/components/ui/AnchoredList";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { locationSearchWireCandidate } from "@/lib/test/fixtures/location";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await page.viewport(1024, 768);
});

describe("Portalled suggestions inside a modal", () => {
  it("keeps a plain anchored list pointer-selectable without dismissing the modal", async () => {
    const selected = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(false);
      const [anchor, setAnchor] = useState<HTMLElement | null>(null);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open location modal</Button>
          <Modal open={open} title="Choose location" onClose={() => setOpen(false)}>
            <Button onClick={(event) => setAnchor(event.currentTarget)}>Show suggestions</Button>
            <AnchoredList anchorEl={anchor} open={Boolean(anchor)}>
              <div role="listbox" aria-label="Locations">
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => {
                    selected("Warsaw");
                    setAnchor(null);
                  }}
                >
                  Warsaw
                </button>
              </div>
            </AnchoredList>
          </Modal>
        </>
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open location modal" }));
    const dialog = screen.getByRole("dialog", { name: "Choose location" });
    await userEvent.click(screen.getByRole("button", { name: "Show suggestions" }));
    const option = await screen.findByRole("option", { name: "Warsaw" });
    expect(option.closest('[aria-hidden="true"]')).toBeNull();
    expect(dialog.contains(option)).toBe(false);
    expect(getComputedStyle(option).pointerEvents).toBe("auto");
    await userEvent.keyboard("{Tab}");
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.click(option);
    expect(selected).toHaveBeenCalledExactlyOnceWith("Warsaw");
    expect(screen.getByRole("dialog", { name: "Choose location" })).toBe(dialog);
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Show suggestions" }));
    const overlay = document.querySelector('[data-slot="dialog-overlay"]') as HTMLElement;
    const rect = overlay.getBoundingClientRect();
    const position = { x: 16, y: Math.floor(rect.height / 2) };
    expect(document.elementFromPoint(rect.left + position.x, rect.top + position.y)).toBe(overlay);
    const pointerDown = vi.fn();
    overlay.addEventListener("pointerdown", pointerDown);
    try {
      await userEvent.click(overlay, { position });
      expect(pointerDown).toHaveBeenCalledOnce();
    } finally {
      overlay.removeEventListener("pointerdown", pointerDown);
    }
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(selected).toHaveBeenCalledOnce();
  });

  it("selects a real LocationField suggestion by pointer and preserves dialog focus and Escape", async () => {
    const selected = vi.fn();
    const closed = vi.fn();
    const country = countryValueForName("United States");
    if (!country) throw new Error("Missing United States test country");
    const initialValue = country;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () =>
        Response.json({
          data: [
            locationSearchWireCandidate({
              canonical_key: "PL/Mazovia/Warsaw",
              city_name: "Warsaw",
              country_code: "PL",
              display_name: "Warsaw, Mazovia, Poland",
              id: "location:PL/Mazovia/Warsaw",
              kind: "city",
              region_name: "Mazovia",
            }),
          ],
        }),
      ),
    );
    function Harness() {
      const [open, setOpen] = useState(false);
      const [value, setValue] = useState(initialValue);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open tracking</Button>
          <Modal
            open={open}
            title="Tracking location"
            onClose={() => {
              closed();
              setOpen(false);
            }}
          >
            <LocationField
              value={value}
              onChange={(next) => {
                selected(next);
                setValue(next);
              }}
            />
          </Modal>
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open tracking" });
    await userEvent.click(trigger);
    const input = screen.getByRole("combobox", { name: "Location" });
    await userEvent.fill(input, "Wars");
    const option = await screen.findByRole("option", { name: /Warsaw/ });
    expect(option.closest('[aria-hidden="true"]')).toBeNull();
    const listId = input.getAttribute("aria-controls");
    expect(listId).toBeTruthy();
    expect(document.getElementById(listId ?? "")?.contains(option)).toBe(true);
    await userEvent.keyboard("{ArrowDown}");
    expect(input.getAttribute("aria-activedescendant")).toBe(option.id);
    expect(getComputedStyle(option).pointerEvents).toBe("auto");
    await userEvent.click(option);
    expect(selected).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ canonicalKey: "PL/Mazovia/Warsaw", kind: "city" }),
    );
    expect((input as HTMLInputElement).value).toBe("Warsaw, Mazovia, Poland");
    expect(screen.getByRole("dialog", { name: "Tracking location" })).toBeTruthy();
    expect(closed).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(closed).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);
  });
});
