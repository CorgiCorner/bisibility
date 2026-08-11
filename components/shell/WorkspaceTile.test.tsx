import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceTile } from "./WorkspaceTile";

describe("WorkspaceTile", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps its letter until a full-size domain favicon is verified", () => {
    const { container } = render(<WorkspaceTile domain="example.com" />);

    expect(screen.getByText("e")).toBeInTheDocument();
    expect(screen.queryByTestId("workspace-tile-favicon")).not.toBeInTheDocument();
    const probe = screen.getByTestId("workspace-tile-favicon-probe");
    Object.defineProperties(probe, {
      naturalHeight: { configurable: true, value: 64 },
      naturalWidth: { configurable: true, value: 64 },
    });
    fireEvent.load(probe);
    expect(screen.getByTestId("workspace-tile-favicon")).toHaveStyle({
      backgroundImage: 'url("https://www.google.com/s2/favicons?domain=example.com&sz=64")',
      backgroundSize: "cover",
    });
    expect(container.innerHTML).not.toContain("logo.dev");
  });

  it("keeps its letter when the favicon service returns a smaller fallback image", () => {
    render(<WorkspaceTile domain="example.com" />);

    const probe = screen.getByTestId("workspace-tile-favicon-probe");
    Object.defineProperties(probe, {
      naturalHeight: { configurable: true, value: 16 },
      naturalWidth: { configurable: true, value: 16 },
    });
    fireEvent.load(probe);

    expect(screen.getByText("e")).toBeInTheDocument();
    expect(screen.queryByTestId("workspace-tile-favicon")).not.toBeInTheDocument();
  });

  it("keeps its letter without a domain request when opted out", () => {
    vi.stubEnv("NEXT_PUBLIC_DOMAIN_ICONS", "off");
    render(<WorkspaceTile domain="example.com" />);

    expect(screen.getByText("e")).toBeInTheDocument();
    expect(screen.queryByTestId("workspace-tile-favicon-probe")).not.toBeInTheDocument();
    expect(screen.queryByTestId("workspace-tile-favicon")).not.toBeInTheDocument();
  });
});
