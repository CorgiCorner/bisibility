import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type StatusKind, StatusPill } from "./StatusPill";

const ALL_KINDS: StatusKind[] = [
  "connected",
  "needs_reauth",
  "ready",
  "planned",
  "optional",
  "success",
  "failed",
  "matches",
  "wrong_url",
  "primary",
  "disabled",
  "create",
  "update",
  "delete",
  "import",
  "export",
  "login",
];

describe("StatusPill", () => {
  it("never applies bv-ping to any status dot", () => {
    for (const kind of ALL_KINDS) {
      const { unmount } = render(<StatusPill status={kind} />);
      const dots = document.querySelectorAll("span[aria-hidden]");
      for (const dot of dots) {
        expect(dot).not.toHaveClass("bv-ping");
      }
      unmount();
    }
  });

  it("shows a green static dot for connected", () => {
    render(<StatusPill status="connected" />);

    const dot = screen.getByText("Connected").querySelector("span[aria-hidden]");
    expect(dot).not.toBeNull();
    expect(dot).toHaveStyle({ backgroundColor: "var(--green)" });
    expect(dot).not.toHaveClass("bv-ping");
  });

  it("renders the correct default label for every existing kind", () => {
    const LABELS: Record<StatusKind, string> = {
      connected: "Connected",
      needs_reauth: "Reconnect required",
      ready: "Ready",
      planned: "Planned",
      optional: "Optional",
      success: "Success",
      failed: "Failed",
      matches: "Matches",
      wrong_url: "Wrong URL",
      primary: "Primary",
      disabled: "Disabled",
      create: "CREATE",
      update: "UPDATE",
      delete: "DELETE",
      import: "IMPORT",
      export: "EXPORT",
      login: "LOGIN",
    };

    for (const kind of ALL_KINDS) {
      const { unmount } = render(<StatusPill status={kind} />);
      expect(screen.getByText(LABELS[kind])).toBeInTheDocument();
      unmount();
    }
  });

  it("renders a primary badge alongside the status chip", () => {
    render(<StatusPill status="ready" primary />);

    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Primary")).toBeInTheDocument();
    const dots = document.querySelectorAll("span[aria-hidden]");
    expect(dots.length).toBe(2);
    for (const dot of dots) {
      expect(dot).not.toHaveClass("bv-ping");
    }
  });

  it("hides the dot when showDot is false", () => {
    render(<StatusPill status="ready" showDot={false} />);

    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(document.querySelectorAll("span[aria-hidden]")).toHaveLength(0);
  });

  it("hides the dot for planned by default but shows it when explicitly requested", () => {
    const { rerender } = render(<StatusPill status="planned" />);
    expect(screen.getByText("Planned")).toBeInTheDocument();
    expect(document.querySelectorAll("span[aria-hidden]")).toHaveLength(0);

    rerender(<StatusPill status="planned" showDot />);
    expect(document.querySelectorAll("span[aria-hidden]")).toHaveLength(1);
  });
});
