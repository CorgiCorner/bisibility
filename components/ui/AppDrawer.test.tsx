import { MOTION_DRAWER_ENTER, MOTION_DRAWER_EXIT } from "@/lib/ui/motion";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppDrawer } from "./AppDrawer";

let lastDrawerProps: Record<string, unknown> = {};

vi.mock("@mui/material/Drawer", () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) => {
    lastDrawerProps = props;
    return <div data-testid="mock-drawer">{children}</div>;
  },
}));

function setMediaQuery(reduced: boolean) {
  const queries: Record<string, boolean> = {
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

  it("exposes the Paper slot as role=dialog with aria-labelledby matching the heading id", () => {
    render(
      <AppDrawer onClose={vi.fn()} open title="Dialog title">
        <button type="button">content</button>
      </AppDrawer>,
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
    expect(lastDrawerProps.transitionDuration).toEqual({
      enter: MOTION_DRAWER_ENTER,
      exit: MOTION_DRAWER_EXIT,
    });
  });

  it("does not zero the Slide timeout under normal motion", () => {
    render(
      <AppDrawer onClose={vi.fn()} open title="Normal timeout">
        <button type="button">content</button>
      </AppDrawer>,
    );
    const slotProps = lastDrawerProps.slotProps as Record<string, Record<string, unknown>>;
    expect(slotProps.transition).not.toHaveProperty("timeout");
  });

  it("zeros only the Slide transition timeout under reduced-motion", () => {
    const media = setMediaQuery(false);
    render(
      <AppDrawer onClose={vi.fn()} open title="Reduced">
        <button type="button">content</button>
      </AppDrawer>,
    );
    let slotProps = lastDrawerProps.slotProps as Record<string, Record<string, unknown>>;
    expect(slotProps.transition).not.toHaveProperty("timeout");

    act(() => {
      media.setReducedMotion(true);
    });
    slotProps = lastDrawerProps.slotProps as Record<string, Record<string, unknown>>;
    expect(slotProps.transition).toHaveProperty("timeout", 0);
  });

  it("keeps the normal transitionDuration under reduced-motion (backdrop fade intact)", () => {
    setMediaQuery(true);
    render(
      <AppDrawer onClose={vi.fn()} open title="Reduced backdrop">
        <button type="button">content</button>
      </AppDrawer>,
    );
    expect(lastDrawerProps.transitionDuration).toEqual({
      enter: MOTION_DRAWER_ENTER,
      exit: MOTION_DRAWER_EXIT,
    });
  });
});

describe("AppDrawer exit lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastDrawerProps = {};
    setMediaQuery(false);
  });

  it("passes onExited to the Drawer transition slot", () => {
    const onExited = vi.fn();
    render(
      <AppDrawer onClose={vi.fn()} onExited={onExited} open title="Exit test">
        <button type="button">content</button>
      </AppDrawer>,
    );
    const slotProps = lastDrawerProps.slotProps as Record<string, Record<string, unknown>>;
    expect(slotProps.transition).toHaveProperty("onExited", onExited);
  });

  it("keeps onExited wired under reduced-motion", () => {
    setMediaQuery(true);
    const onExited = vi.fn();
    render(
      <AppDrawer onClose={vi.fn()} onExited={onExited} open title="Exit reduced">
        <button type="button">content</button>
      </AppDrawer>,
    );
    const slotProps = lastDrawerProps.slotProps as Record<string, Record<string, unknown>>;
    expect(slotProps.transition).toHaveProperty("onExited", onExited);
    expect(slotProps.transition).toHaveProperty("timeout", 0);
  });
});
