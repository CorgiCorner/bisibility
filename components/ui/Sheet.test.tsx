import { MOTION_DRAWER_ENTER, MOTION_DRAWER_EXIT } from "@/lib/ui/motion";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sheet } from "./Sheet";

let lastDrawerProps: Record<string, unknown> = {};

vi.mock("@mui/material/Drawer", () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) => {
    lastDrawerProps = props;
    return <div data-testid="mock-drawer">{children}</div>;
  },
}));

function setMediaQueries(desktop: boolean, reduced: boolean) {
  const queries: Record<string, boolean> = {
    "(min-width:1024px)": desktop,
    "(prefers-reduced-motion: reduce)": reduced,
  };
  const listeners = new Map<string, Set<(e: { matches: boolean }) => void>>();
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    get matches() {
      return queries[q] ?? false;
    },
    media: q,
    addEventListener: vi.fn((event: string, cb: (e: { matches: boolean }) => void) => {
      if (event === "change") {
        let set = listeners.get(q);
        if (!set) {
          set = new Set();
          listeners.set(q, set);
        }
        set.add(cb);
      }
    }),
    removeEventListener: vi.fn((event: string, cb: (e: { matches: boolean }) => void) => {
      if (event === "change") {
        listeners.get(q)?.delete(cb);
      }
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;

  return {
    setReducedMotion(value: boolean) {
      queries["(prefers-reduced-motion: reduce)"] = value;
      for (const cb of listeners.get("(prefers-reduced-motion: reduce)") ?? []) {
        cb({ matches: value });
      }
    },
  };
}

describe("Sheet rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastDrawerProps = {};
    setMediaQueries(true, false);
  });

  it("renders content and a close button", () => {
    render(
      <Sheet onClose={vi.fn()} open title="Test sheet">
        <button type="button">sheet content</button>
      </Sheet>,
    );
    expect(screen.getByText("sheet content")).toBeInTheDocument();
    const close = screen.getByRole("button", { name: "Close sheet" });
    expect(close).toHaveClass("duration-[var(--motion-press)]");
    expect(close).toHaveClass("motion-safe:active:not-focus-visible:scale-[0.97]");
  });

  it("does not render a mobile drag handle", () => {
    render(
      <Sheet onClose={vi.fn()} open title="Test sheet">
        <button type="button">content</button>
      </Sheet>,
    );
    expect(document.querySelector(".lg\\:hidden")).toBeNull();
  });

  it("renders an h2 title", () => {
    render(
      <Sheet onClose={vi.fn()} open title="Test sheet">
        <button type="button">content</button>
      </Sheet>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Test sheet" })).toBeInTheDocument();
  });
});

describe("Sheet dialog semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastDrawerProps = {};
    setMediaQueries(true, false);
  });

  it("exposes the Paper slot as role=dialog with aria-labelledby matching the heading id", () => {
    render(
      <Sheet onClose={vi.fn()} open title="Dialog title">
        <button type="button">content</button>
      </Sheet>,
    );
    const slotProps = lastDrawerProps.slotProps as Record<string, Record<string, unknown>>;
    const paper = slotProps.paper as Record<string, unknown>;
    expect(paper).toHaveProperty("role", "dialog");
    const labelledBy = paper["aria-labelledby"] as string;
    expect(typeof labelledBy).toBe("string");
    expect(labelledBy.length).toBeGreaterThan(0);
    const heading = screen.getByRole("heading", { level: 2, name: "Dialog title" });
    expect(heading).toHaveAttribute("id", labelledBy);
  });
});

describe("Sheet transition props", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastDrawerProps = {};
  });

  it("uses motion-token durations for transitionDuration under normal motion", () => {
    setMediaQueries(true, false);
    render(
      <Sheet onClose={vi.fn()} open title="Normal">
        <button type="button">content</button>
      </Sheet>,
    );
    expect(lastDrawerProps.transitionDuration).toEqual({
      enter: MOTION_DRAWER_ENTER,
      exit: MOTION_DRAWER_EXIT,
    });
  });

  it("zeros the Slide transition timeout under reduced-motion", () => {
    const media = setMediaQueries(true, false);
    render(
      <Sheet onClose={vi.fn()} open title="Reduced">
        <button type="button">content</button>
      </Sheet>,
    );
    let slotProps = lastDrawerProps.slotProps as Record<string, Record<string, unknown>>;
    expect(slotProps.transition).not.toHaveProperty("timeout");

    act(() => {
      media.setReducedMotion(true);
    });
    slotProps = lastDrawerProps.slotProps as Record<string, Record<string, unknown>>;
    expect(slotProps.transition).toHaveProperty("timeout", 0);
  });

  it("keeps the backdrop fade intact under reduced-motion", () => {
    setMediaQueries(true, true);
    render(
      <Sheet onClose={vi.fn()} open title="Reduced backdrop">
        <button type="button">content</button>
      </Sheet>,
    );
    expect(lastDrawerProps.transitionDuration).toEqual({
      enter: MOTION_DRAWER_ENTER,
      exit: MOTION_DRAWER_EXIT,
    });
  });

  it("does not zero the Slide timeout under normal motion", () => {
    setMediaQueries(true, false);
    render(
      <Sheet onClose={vi.fn()} open title="Normal timeout">
        <button type="button">content</button>
      </Sheet>,
    );
    const slotProps = lastDrawerProps.slotProps as Record<string, Record<string, unknown>>;
    expect(slotProps.transition).not.toHaveProperty("timeout");
  });
});

describe("Sheet exit lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastDrawerProps = {};
    setMediaQueries(true, false);
  });

  it("passes onExited to the Drawer transition slot", () => {
    const onExited = vi.fn();
    render(
      <Sheet onClose={vi.fn()} onExited={onExited} open title="Exit test">
        <button type="button">content</button>
      </Sheet>,
    );
    const slotProps = lastDrawerProps.slotProps as Record<string, Record<string, unknown>>;
    expect(slotProps.transition).toHaveProperty("onExited", onExited);
  });

  it("does not pass onExited when not provided", () => {
    render(
      <Sheet onClose={vi.fn()} open title="No exit cb">
        <button type="button">content</button>
      </Sheet>,
    );
    const slotProps = lastDrawerProps.slotProps as Record<string, Record<string, unknown>>;
    expect(slotProps.transition).not.toHaveProperty("onExited");
  });
});

describe("Sheet anchors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastDrawerProps = {};
  });

  it("uses a right anchor on desktop (>= 1024px)", () => {
    setMediaQueries(true, false);
    render(
      <Sheet onClose={vi.fn()} open title="Desktop">
        <button type="button">content</button>
      </Sheet>,
    );
    expect(lastDrawerProps.anchor).toBe("right");
  });

  it("uses a bottom anchor on mobile (< 1024px)", () => {
    setMediaQueries(false, false);
    render(
      <Sheet onClose={vi.fn()} open title="Mobile">
        <button type="button">content</button>
      </Sheet>,
    );
    expect(lastDrawerProps.anchor).toBe("bottom");
  });
});
