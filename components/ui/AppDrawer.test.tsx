import { MOTION_DRAWER_ENTER, MOTION_DRAWER_EXIT } from "@/lib/ui/motion";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppDrawer } from "./AppDrawer";

let lastDrawerProps: Record<string, unknown> = {};

vi.mock("@/components/ui/DialogSurface", () => ({
  DialogSurface: ({ children, ...props }: { children: React.ReactNode }) => {
    lastDrawerProps = props;
    return <div data-testid="mock-drawer">{children}</div>;
  },
}));

function setMediaQuery(reduced: boolean, narrow = false) {
  const queries: Record<string, boolean> = {
    "(max-width:640px)": narrow,
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

describe("AppDrawer rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastDrawerProps = {};
    setMediaQuery(false);
  });

  it("renders content, title, description, and a close button", () => {
    render(
      <AppDrawer onClose={vi.fn()} open title="Edit widget" description="Tune settings">
        <button type="button">drawer content</button>
      </AppDrawer>,
    );
    expect(screen.getByText("drawer content")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Edit widget" })).toBeInTheDocument();
    expect(screen.getByText("Tune settings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close drawer" })).toBeInTheDocument();
  });

  it("supports a ReactNode title without crowding the close button", () => {
    render(
      <AppDrawer
        onClose={vi.fn()}
        open
        title={<span>Long query title</span>}
        titleAction={<a href="https://example.com">source</a>}
      >
        <button type="button">content</button>
      </AppDrawer>,
    );

    const heading = screen.getByRole("heading", { level: 2, name: "Long query title" });
    expect(heading).toHaveClass("min-w-0", "truncate");
    expect(screen.getByRole("link", { name: "source" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close drawer" })).toHaveClass("shrink-0");
  });

  it("omits the description paragraph when not provided", () => {
    render(
      <AppDrawer onClose={vi.fn()} open title="No desc">
        <button type="button">content</button>
      </AppDrawer>,
    );
    expect(screen.queryByText("Tune settings")).toBeNull();
  });

  it("renders a footer when provided", () => {
    render(
      <AppDrawer onClose={vi.fn()} open title="Footer test" footer={<span>save</span>}>
        <button type="button">content</button>
      </AppDrawer>,
    );
    expect(screen.getByText("save")).toBeInTheDocument();
  });
});

describe("AppDrawer dialog semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastDrawerProps = {};
    setMediaQuery(false);
  });

  it("exposes each panel as a labelled modal dialog", () => {
    render(
      <AppDrawer onClose={vi.fn()} open title="Dialog title">
        <button type="button">content</button>
      </AppDrawer>,
    );
    const slotProps = lastDrawerProps as Record<string, Record<string, unknown>>;
    const paper = slotProps.contentProps as Record<string, unknown>;
    expect(paper).toHaveProperty("role", "dialog");
    expect(paper).not.toHaveProperty("aria-label");
    expect(paper).toHaveProperty("aria-modal", true);
    const labelledBy = paper["aria-labelledby"] as string;
    expect(typeof labelledBy).toBe("string");
    expect(labelledBy.length).toBeGreaterThan(0);
    const heading = screen.getByRole("heading", { level: 2, name: "Dialog title" });
    expect(heading).toHaveAttribute("id", labelledBy);
  });
});

describe("AppDrawer motion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastDrawerProps = {};
    setMediaQuery(false);
  });

  it("uses the drawer motion tokens under normal motion", () => {
    render(
      <AppDrawer onClose={vi.fn()} open title="Normal">
        <button type="button">content</button>
      </AppDrawer>,
    );
    expect(lastDrawerProps.duration).toEqual({
      enter: MOTION_DRAWER_ENTER,
      exit: MOTION_DRAWER_EXIT,
    });
  });

  it("does not zero the transition durations under normal motion", () => {
    render(
      <AppDrawer onClose={vi.fn()} open title="Normal timeout">
        <button type="button">content</button>
      </AppDrawer>,
    );
    const _slotProps = lastDrawerProps as Record<string, Record<string, unknown>>;
    expect(lastDrawerProps.duration).toEqual({
      enter: MOTION_DRAWER_ENTER,
      exit: MOTION_DRAWER_EXIT,
    });
  });

  it("zeros the transition durations under reduced-motion", () => {
    const media = setMediaQuery(false);
    render(
      <AppDrawer onClose={vi.fn()} open title="Reduced">
        <button type="button">content</button>
      </AppDrawer>,
    );
    let _slotProps = lastDrawerProps as Record<string, Record<string, unknown>>;
    expect(lastDrawerProps.duration).toEqual({
      enter: MOTION_DRAWER_ENTER,
      exit: MOTION_DRAWER_EXIT,
    });

    act(() => {
      media.setReducedMotion(true);
    });
    _slotProps = lastDrawerProps as Record<string, Record<string, unknown>>;
    expect(lastDrawerProps.duration).toEqual({ enter: 0, exit: 0 });
  });

  it("disables all movement under reduced motion", () => {
    setMediaQuery(true);
    render(
      <AppDrawer onClose={vi.fn()} open title="Reduced backdrop">
        <button type="button">content</button>
      </AppDrawer>,
    );
    expect(lastDrawerProps.duration).toEqual({
      enter: 0,
      exit: 0,
    });
  });
});

describe("AppDrawer exit lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastDrawerProps = {};
    setMediaQuery(false);
  });

  it("passes onExited to the dialog exit lifecycle", () => {
    const onExited = vi.fn();
    render(
      <AppDrawer onClose={vi.fn()} onExited={onExited} open title="Exit test">
        <button type="button">content</button>
      </AppDrawer>,
    );
    const _slotProps = lastDrawerProps as Record<string, Record<string, unknown>>;
    expect(lastDrawerProps.onExited).toBe(onExited);
  });

  it("keeps onExited wired under reduced-motion", () => {
    setMediaQuery(true);
    const onExited = vi.fn();
    render(
      <AppDrawer onClose={vi.fn()} onExited={onExited} open title="Exit reduced">
        <button type="button">content</button>
      </AppDrawer>,
    );
    const _slotProps = lastDrawerProps as Record<string, Record<string, unknown>>;
    expect(lastDrawerProps.onExited).toBe(onExited);
    expect(lastDrawerProps.duration).toEqual({ enter: 0, exit: 0 });
  });
});

describe("AppDrawer stacked panels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastDrawerProps = {};
    setMediaQuery(false);
  });

  it("puts the leading control above the title, for a way back out of a stack", () => {
    render(
      <AppDrawer
        headerLeading={<button type="button">Back to the list</button>}
        onClose={vi.fn()}
        open
        title="Second panel"
      >
        <button type="button">content</button>
      </AppDrawer>,
    );
    expect(screen.getByRole("button", { name: "Back to the list" })).toBeInTheDocument();
  });

  it("says why it is closing, so a caller can treat Escape as a step back", () => {
    const onClose = vi.fn();
    render(
      <AppDrawer onClose={onClose} open title="Reasoned close">
        <button type="button">content</button>
      </AppDrawer>,
    );

    const drawerClose = lastDrawerProps.onClose as (event: object, reason: string) => void;
    drawerClose({}, "escapeKeyDown");
    expect(onClose).toHaveBeenCalledWith("escapeKeyDown");

    screen.getByRole("button", { name: "Close drawer" }).click();
    expect(onClose).toHaveBeenLastCalledWith();
  });

  it("leaves the caret alone by default", () => {
    render(
      <AppDrawer onClose={vi.fn()} open title="No autofocus">
        <button type="button">content</button>
      </AppDrawer>,
    );
    expect(screen.getByRole("button", { name: "Close drawer" })).not.toHaveFocus();
  });

  it("puts the caret on the close button when the caller asks for it", () => {
    render(
      <AppDrawer autoFocusClose onClose={vi.fn()} open title="Autofocus">
        <button type="button">content</button>
      </AppDrawer>,
    );
    expect(screen.getByRole("button", { name: "Close drawer" })).toHaveFocus();
  });

  it("becomes a bottom sheet on a phone, where a thumb reaches", () => {
    setMediaQuery(false, true);
    render(
      <AppDrawer onClose={vi.fn()} open sheetOnMobile title="Sheet">
        <button type="button">content</button>
      </AppDrawer>,
    );

    expect(lastDrawerProps.side).toBe("bottom");
    const slotProps = lastDrawerProps as Record<string, Record<string, unknown>>;
    expect(slotProps.contentProps.style).toMatchObject({ maxHeight: "88vh", width: "100%" });
  });

  it("stays a side panel on a wide screen", () => {
    render(
      <AppDrawer onClose={vi.fn()} open sheetOnMobile title="Panel">
        <button type="button">content</button>
      </AppDrawer>,
    );

    expect(lastDrawerProps.side).toBe("right");
    const slotProps = lastDrawerProps as Record<string, Record<string, unknown>>;
    expect(slotProps.contentProps.style).toMatchObject({ width: 560 });
  });
});
