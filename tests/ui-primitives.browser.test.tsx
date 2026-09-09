/// <reference types="vite/client" />
import "@/app/globals.css";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { Modal } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";
import { applyTheme } from "@/lib/theme/browser-theme";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

// CSS geometry and transitions need a layout engine; jsdom cannot verify these contracts.
afterEach(cleanup);
function color(element: HTMLElement, token: string) {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  element.appendChild(probe);
  const result = getComputedStyle(probe).color;
  probe.remove();
  return result;
}

describe("Native control style contracts", () => {
  it("keeps the four button sizes and the small pill geometry", () => {
    render(
      <>
        <Button size="xs">Extra small</Button>
        <Button size="sm">Small</Button>
        <Button>Medium</Button>
        <Button size="lg">Large</Button>
        <Pill size="sm">Filter</Pill>
      </>,
    );
    for (const [name, height, font] of [
      ["Extra small", 30, "12px"],
      ["Small", 34, "12.5px"],
      ["Medium", 36, "13px"],
      ["Large", 44, "14.5px"],
    ] as const) {
      const button = screen.getByRole("button", { name });
      expect(button.getBoundingClientRect().height).toBe(height);
      expect(getComputedStyle(button).fontSize).toBe(font);
      expect(getComputedStyle(button).borderRadius).toBe("6px");
    }
    const pill = screen.getByRole("button", { name: "Filter" });
    expect(pill.getBoundingClientRect().height).toBe(28);
    expect(getComputedStyle(pill).fontSize).toBe("11px");
    expect(Number.parseFloat(getComputedStyle(pill).borderRadius)).toBeGreaterThan(14);
  });

  it.each(["light", "dark"] as const)(
    "uses the shared colors for every button variant in %s",
    (theme) => {
      applyTheme(theme);
      render(
        <>
          <Button href="/connect">Connect</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="destructive">Delete</Button>
          <Button variant="ghost">Ghost</Button>
        </>,
      );
      for (const [name, role, bg, fg] of [
        ["Connect", "link", "--accent-solid", "--accent-on-solid"],
        ["Secondary", "button", "--bg-elev", "--fg"],
        ["Delete", "button", "--red", "--error-contrast"],
      ] as const) {
        const control = screen.getByRole(role, { name });
        const style = getComputedStyle(control);
        expect(style.backgroundColor).toBe(color(control, bg));
        expect(style.color).toBe(color(control, fg));
      }
      expect(getComputedStyle(screen.getByRole("button", { name: "Ghost" })).backgroundColor).toBe(
        "rgba(0, 0, 0, 0)",
      );
    },
  );

  it.each(["primary", "secondary", "destructive", "ghost"] as const)(
    "preserves %s paint and borders while loading",
    (variant) => {
      const view = render(<Button variant={variant}>Save</Button>);
      const button = screen.getByRole("button", { name: "Save" });
      const before = getComputedStyle(button);
      const expected = {
        background: before.backgroundColor,
        color: before.color,
        border: before.borderStyle,
        height: button.getBoundingClientRect().height,
      };
      view.rerender(
        <Button variant={variant} loading>
          Save
        </Button>,
      );
      const after = getComputedStyle(button);
      expect(after.backgroundColor).toBe(expected.background);
      expect(after.color).toBe(expected.color);
      expect(after.borderStyle).toBe(expected.border);
      expect(button.getBoundingClientRect().height).toBe(expected.height);
      expect(after.opacity).toBe("0.65");
      expect(button.hasAttribute("disabled")).toBe(true);
    },
  );

  it("reserves ghost fill and the visible outline for keyboard focus after the pointer leaves", async () => {
    render(
      <>
        <Button variant="ghost">Ghost</Button>
        <Button>Next</Button>
      </>,
    );
    const button = screen.getByRole("button", { name: "Ghost" });
    const width = button.getBoundingClientRect().width;
    await userEvent.hover(button);
    expect(getComputedStyle(button).borderStyle).toBe("none");
    expect(button.getBoundingClientRect().width).toBe(width);
    await userEvent.click(button);
    await userEvent.hover(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(getComputedStyle(button).backgroundColor).toBe("rgba(0, 0, 0, 0)"));
    expect(button.matches(":focus-visible")).toBe(false);
    await userEvent.tab();
    await userEvent.tab({ shift: true });
    expect(button.matches(":focus-visible")).toBe(true);
    expect(getComputedStyle(button).outlineWidth).toBe("2px");
    const focusColor = color(button, "--bg-sunken");
    await waitFor(() => expect(getComputedStyle(button).backgroundColor).toBe(focusColor));
  });

  it("uses guarded press scaling for solid buttons, pills and copy controls", () => {
    render(
      <>
        <Button>Action</Button>
        <Pill>Filter</Pill>
        <CopyButton label="Copy" text="demo" />
      </>,
    );
    const css = Array.from(document.styleSheets)
      .flatMap((sheet) => {
        try {
          return Array.from(sheet.cssRules, (rule) => rule.cssText);
        } catch {
          return [];
        }
      })
      .join("\n");
    expect(css).toContain("prefers-reduced-motion: no-preference");
    expect(css).toContain(":not(:focus-visible):not(:disabled)");
    expect(
      getComputedStyle(screen.getByRole("button", { name: "Filter" }))
        .getPropertyValue("--control-press-scale")
        .trim(),
    ).toBe(".98");
  });
});

describe("Dialog browser lifecycle", () => {
  it("traps focus, retains content through exit, and restores the trigger after the animation", async () => {
    const exited = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open panel</Button>
          <Modal open={open} onClose={() => setOpen(false)} onExited={exited} title="Edit settings">
            <Button>First action</Button>
          </Modal>
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open panel" });
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Edit settings" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    const exitState = vi.fn();
    const observer = new MutationObserver(() => {
      if (dialog.dataset.state !== "closed") return;
      exitState(dialog.isConnected, exited.mock.calls.length);
      observer.disconnect();
    });
    observer.observe(dialog, { attributes: true, attributeFilter: ["data-state"] });
    await userEvent.keyboard("{Escape}");
    expect(exitState).toHaveBeenCalledWith(true, 0);
    await waitFor(() => expect(exited).toHaveBeenCalledOnce());
    expect(document.body.contains(dialog)).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });
});
