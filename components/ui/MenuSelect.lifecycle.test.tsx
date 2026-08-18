import { MenuMultiSelect, MenuSelect } from "@/components/ui/MenuSelect";
import { menuTransitionDuration, useMenuExitLifecycle } from "@/components/ui/menu-exit-lifecycle";
import { MOTION_MENU_ENTER, MOTION_MENU_EXIT } from "@/lib/ui/motion";
import { FROZEN_NOW_MS } from "@/tests/clock";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef, forwardRef, useImperativeHandle, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rect = {
  bottom: 34,
  height: 34,
  left: 0,
  right: 240,
  top: 0,
  width: 240,
  x: 0,
  y: 0,
  toJSON: () => ({}),
};

function restoreTimers() {
  vi.useRealTimers();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN_NOW_MS);
}

describe("MenuSelect exit lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    restoreTimers();
    vi.restoreAllMocks();
  });

  it("keeps searched rows through close then resets search after exit completes", () => {
    render(
      <MenuSelect
        ariaLabel="Time zone"
        onChange={() => undefined}
        options={[
          { label: "UTC (GMT+00:00)", value: "UTC" },
          { label: "Europe/Warsaw (GMT+02:00)", value: "Europe/Warsaw" },
        ]}
        searchable
        value="UTC"
      />,
    );

    const trigger = screen.getByRole("button", { name: "Time zone" });
    fireEvent.click(trigger);
    const search = screen.getByRole("textbox", { name: "Search..." });
    fireEvent.change(search, { target: { value: "warsaw" } });
    expect(screen.getByRole("menuitem", { name: /Europe\/Warsaw/ })).toBeInTheDocument();

    fireEvent.keyDown(search, { key: "Escape" });
    fireEvent.click(trigger);
    expect(screen.getByRole("textbox", { name: "Search..." })).toHaveValue("warsaw");
    expect(screen.getByRole("menuitem", { name: /Europe\/Warsaw/ })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole("textbox", { name: "Search..." })).toHaveValue("warsaw");

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Search..." }), { key: "Escape" });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.click(trigger);
    expect(screen.getByRole("textbox", { name: "Search..." })).toHaveValue("");
  });

  it("does not let a stale exit callback erase a freshly reopened menu", () => {
    render(
      <MenuSelect
        ariaLabel="Time zone"
        onChange={() => undefined}
        options={[
          { label: "UTC (GMT+00:00)", value: "UTC" },
          { label: "Europe/Warsaw (GMT+02:00)", value: "Europe/Warsaw" },
        ]}
        searchable
        value="UTC"
      />,
    );

    const trigger = screen.getByRole("button", { name: "Time zone" });
    fireEvent.click(trigger);
    fireEvent.change(screen.getByRole("textbox", { name: "Search..." }), {
      target: { value: "warsaw" },
    });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Search..." }), { key: "Escape" });

    fireEvent.click(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole("textbox", { name: "Search..." })).toHaveValue("warsaw");
  });
});

describe("MenuMultiSelect exit lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    restoreTimers();
    vi.restoreAllMocks();
  });

  it("freezes search and measured width through a stale exit on rapid reopen", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect);
    render(
      <MenuMultiSelect
        ariaLabel="Markets"
        onChange={() => undefined}
        options={[
          { label: "United States", value: "us" },
          { label: "Poland", value: "pl" },
        ]}
        searchPlaceholder="Search markets..."
        searchable
        values={["us"]}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Markets" });
    fireEvent.click(trigger);
    expect(trigger).toHaveStyle({ width: "240px" });
    fireEvent.change(screen.getByRole("textbox", { name: "Search markets..." }), {
      target: { value: "pol" },
    });
    expect(screen.getByRole("menuitemcheckbox", { name: "Poland" })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Search markets..." }), {
      key: "Escape",
    });
    fireEvent.click(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(trigger).toHaveStyle({ width: "240px" });
    expect(screen.getByRole("textbox", { name: "Search markets..." })).toHaveValue("pol");
    expect(screen.getByRole("menuitemcheckbox", { name: "Poland" })).toBeInTheDocument();
  });

  it("resets search after the exit timeout elapses", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect);
    render(
      <MenuMultiSelect
        ariaLabel="Markets"
        onChange={() => undefined}
        options={[
          { label: "United States", value: "us" },
          { label: "Poland", value: "pl" },
        ]}
        searchPlaceholder="Search markets..."
        searchable
        values={["us"]}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Markets" });
    fireEvent.click(trigger);
    fireEvent.change(screen.getByRole("textbox", { name: "Search markets..." }), {
      target: { value: "pol" },
    });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Search markets..." }), {
      key: "Escape",
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.click(trigger);
    expect(screen.getByRole("textbox", { name: "Search markets..." })).toHaveValue("");
  });
});

describe("menu transition duration", () => {
  it("derives from MOTION_MENU_ENTER and MOTION_MENU_EXIT", () => {
    expect(menuTransitionDuration).toEqual({
      appear: MOTION_MENU_ENTER,
      enter: MOTION_MENU_ENTER,
      exit: MOTION_MENU_EXIT,
    });
    expect(MOTION_MENU_ENTER).toBe(180);
    expect(MOTION_MENU_EXIT).toBe(140);
  });
});

function paperTransition() {
  const paper = document.querySelector(".MuiPaper-root");
  return paper instanceof HTMLElement ? paper.style.transition : "";
}

describe("MenuSelect paper transition duration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    restoreTimers();
    vi.restoreAllMocks();
  });

  it("locks the MenuSelect paper enter to 180ms and exit to 140ms", () => {
    render(
      <MenuSelect
        ariaLabel="Time zone"
        onChange={() => undefined}
        options={[
          { label: "UTC (GMT+00:00)", value: "UTC" },
          { label: "Europe/Warsaw (GMT+02:00)", value: "Europe/Warsaw" },
        ]}
        searchable
        value="UTC"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Time zone" }));
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(paperTransition()).toContain("180ms");
    expect(paperTransition()).toContain("opacity");

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Search..." }), {
      key: "Escape",
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(paperTransition()).toContain("140ms");
  });

  it("locks the MenuMultiSelect paper enter to 180ms and exit to 140ms", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect);
    render(
      <MenuMultiSelect
        ariaLabel="Markets"
        onChange={() => undefined}
        options={[
          { label: "United States", value: "us" },
          { label: "Poland", value: "pl" },
        ]}
        searchable
        values={["us"]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Markets" }));
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(paperTransition()).toContain("180ms");

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Search..." }), {
      key: "Escape",
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(paperTransition()).toContain("140ms");
  });
});

type LifecycleHandle = ReturnType<typeof useMenuExitLifecycle> & { search: string };

const LifecycleHarness = forwardRef<LifecycleHandle>(function LifecycleHarness(_, ref) {
  const [search, setSearch] = useState("warsaw");
  const lifecycle = useMenuExitLifecycle(() => setSearch(""));
  useImperativeHandle(ref, () => ({ ...lifecycle, search }), [lifecycle, search]);
  return <div data-testid="search">{search}</div>;
});

describe("useMenuExitLifecycle rapid-reopen guard", () => {
  it("a late exit callback does not reset state belonging to a reopened menu", () => {
    const ref = createRef<LifecycleHandle>();
    render(<LifecycleHarness ref={ref} />);

    expect(screen.getByTestId("search")).toHaveTextContent("warsaw");

    act(() => ref.current?.openMenu(document.body));
    expect(ref.current?.open).toBe(true);

    act(() => ref.current?.closeMenu());
    expect(ref.current?.open).toBe(false);

    act(() => ref.current?.openMenu(document.body));
    act(() => ref.current?.handleExited());
    expect(screen.getByTestId("search")).toHaveTextContent("warsaw");

    act(() => ref.current?.closeMenu());
    act(() => ref.current?.handleExited());
    expect(screen.getByTestId("search")).toHaveTextContent("");
  });
});
