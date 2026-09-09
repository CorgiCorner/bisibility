/// <reference types="vite/client" />
import "@/app/globals.css";
import { WorkspaceSwitcher } from "@/components/shell/WorkspaceSwitcher";
import { mockWorkspaces } from "@/components/shell/workspaces.mock";
import { Button } from "@/components/ui/Button";
import { MenuMultiSelect } from "@/components/ui/MenuMultiSelect";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Modal } from "@/components/ui/Modal";
import { Sheet } from "@/components/ui/Sheet";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";

const options = [
  { label: "London", value: "london" },
  { label: "Paris", value: "paris", disabled: true, tooltip: "Unavailable in this provider" },
  { label: "Warsaw", value: "warsaw" },
];
afterEach(async () => {
  cleanup();
  await page.viewport(1024, 768);
  await cdp().send("Emulation.setEmulatedMedia", { features: [] });
});

describe("Overlay interaction contracts", () => {
  it("closes a modal on a real outside click", async () => {
    const closed = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open modal</Button>
          <Modal
            open={open}
            title="Outside click"
            onClose={() => {
              closed();
              setOpen(false);
            }}
          >
            Content
          </Modal>
        </>
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open modal" }));
    const overlay = document.querySelector('[data-slot="dialog-overlay"]') as HTMLElement;
    const rect = overlay.getBoundingClientRect();
    const position = { x: 16, y: Math.floor(rect.height / 2) };
    expect(document.elementFromPoint(rect.left + position.x, rect.top + position.y)).toBe(overlay);
    const pointerDown = vi.fn();
    overlay.addEventListener("pointerdown", pointerDown);
    try {
      await userEvent.click(overlay, { position });
      expect(pointerDown).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ target: overlay }),
      );
      await waitFor(() => {
        expect(closed).toHaveBeenCalledOnce();
        expect(screen.queryByRole("dialog")).toBeNull();
      });
    } finally {
      overlay.removeEventListener("pointerdown", pointerDown);
    }
  });

  it("shows an opaque project menu instantly and closes after an outside click", async () => {
    render(
      <WorkspaceSwitcher
        activeProjectId={mockWorkspaces[0].id}
        canCreateWorkspace
        workspaces={mockWorkspaces}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Switch project" }));
    const menu = screen.getByRole("menu", { name: "Projects" });
    const style = getComputedStyle(menu);
    expect(style.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(style.borderTopStyle).toBe("solid");
    expect(style.width).toBe("320px");
    expect(style.animationName).toBe("none");
    await userEvent.click(document.documentElement, { position: { x: 900, y: 700 } });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("searches, selects with the keyboard and restores focus inside the parent dialog", async () => {
    const changed = vi.fn();
    const closed = vi.fn();
    render(
      <Modal open title="Filters" onClose={closed}>
        <MenuSelect
          ariaLabel="City"
          options={options}
          onChange={changed}
          value="london"
          searchable
        />
      </Modal>,
    );
    const trigger = screen.getByRole("button", { name: "City" });
    await userEvent.click(trigger);
    const search = screen.getByRole("textbox", { name: "Search..." });
    expect(document.activeElement).toBe(search);
    await userEvent.fill(search, "Wars");
    expect(screen.queryByRole("menuitem", { name: "London" })).toBeNull();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(changed).toHaveBeenCalledWith("warsaw");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(closed).not.toHaveBeenCalled();
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(closed).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeTruthy();
  });

  it("keeps multiple selections open, runs exit motion and clears search on reopening", async () => {
    function Harness() {
      const [values, setValues] = useState<string[]>([]);
      return (
        <MenuMultiSelect
          ariaLabel="Cities"
          options={options}
          values={values}
          onChange={setValues}
          searchable
        />
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Cities" });
    await userEvent.click(trigger);
    const menu = screen.getByRole("menu");
    expect(getComputedStyle(menu).animationDuration).toBe("0.18s");
    await userEvent.fill(screen.getByRole("textbox", { name: "Search..." }), "Wars");
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Warsaw" }));
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Warsaw" }).getAttribute("aria-checked"),
    ).toBe("true");
    const exitState = vi.fn();
    const observer = new MutationObserver(() => {
      if (menu.dataset.state !== "closed") return;
      exitState(getComputedStyle(menu).animationDuration, menu.isConnected);
      observer.disconnect();
    });
    observer.observe(menu, { attributes: true, attributeFilter: ["data-state"] });
    await userEvent.keyboard("{Escape}");
    expect(exitState).toHaveBeenCalledWith("0.14s", true);
    await waitFor(() => expect(document.body.contains(menu)).toBe(false));
    await userEvent.click(trigger);
    expect((screen.getByRole("textbox", { name: "Search..." }) as HTMLInputElement).value).toBe("");
  });

  it("portals a menu outside a clipping parent and exposes the disabled-option explanation", async () => {
    await page.viewport(375, 700);
    render(
      <div style={{ height: 36, width: 200, overflow: "hidden" }}>
        <MenuSelect ariaLabel="City" options={options} onChange={() => undefined} value="london" />
      </div>,
    );
    const trigger = screen.getByRole("button", { name: "City" });
    await userEvent.click(trigger);
    const menu = screen.getByRole("menu");
    await waitFor(() => expect(menu.getBoundingClientRect().height).toBeGreaterThan(90));
    expect(trigger.parentElement?.contains(menu)).toBe(false);
    const bounds = menu.getBoundingClientRect();
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(375);
    expect(bounds.top).toBeGreaterThanOrEqual(trigger.getBoundingClientRect().bottom);
    await userEvent.hover(screen.getByRole("menuitem", { name: "Paris" }));
    await waitFor(() => expect(screen.getByRole("tooltip").textContent).toContain("Unavailable"));
    expect(screen.getByRole("menuitem", { name: "Paris" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
  });

  it("uses a bottom sheet on mobile and removes motion when the system requests it", async () => {
    await page.viewport(375, 700);
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open sheet</Button>
          <Sheet open={open} title="Edit keyword" onClose={() => setOpen(false)}>
            <Button>Save</Button>
          </Sheet>
        </>
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open sheet" }));
    const sheet = screen.getByRole("dialog", { name: "Edit keyword" });
    expect(sheet.dataset.side).toBe("bottom");
    expect(getComputedStyle(sheet).animationName).toBe("none");
    expect(sheet.getBoundingClientRect().width).toBe(375);
    expect(sheet.getBoundingClientRect().bottom).toBe(700);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open sheet" }));
  });
});
