import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceTile } from "./WorkspaceTile";

describe("WorkspaceTile", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps its letter until a square 32px domain favicon is verified", () => {
    const { container } = render(<WorkspaceTile domain="example.com" />);

    expect(screen.getByText("e")).toBeInTheDocument();
    expect(screen.queryByTestId("workspace-tile-favicon")).not.toBeInTheDocument();
    const probe = screen.getByTestId("workspace-tile-favicon-probe");
    Object.defineProperties(probe, {
      naturalHeight: { configurable: true, value: 32 },
      naturalWidth: { configurable: true, value: 32 },
    });
    fireEvent.load(probe);
    expect(screen.getByTestId("workspace-tile-favicon")).toHaveStyle({
      backgroundImage: 'url("https://www.google.com/s2/favicons?domain=example.com&sz=32")',
      backgroundSize: "cover",
    });
    expect(container.innerHTML).not.toContain("logo.dev");
  });

  it("paints an opaque favicon layer that covers the fallback glyph by stacking contract", () => {
    render(<WorkspaceTile domain="example.com" />);

    expect(screen.getByText("e")).toBeInTheDocument();
    const probe = screen.getByTestId("workspace-tile-favicon-probe");
    Object.defineProperties(probe, {
      naturalHeight: { configurable: true, value: 32 },
      naturalWidth: { configurable: true, value: 32 },
    });
    fireEvent.load(probe);

    const layer = screen.getByTestId("workspace-tile-favicon");
    expect(layer).toHaveStyle({
      backgroundColor: "var(--bg-sunken)",
      backgroundImage: 'url("https://www.google.com/s2/favicons?domain=example.com&sz=32")',
      backgroundSize: "cover",
    });
    expect(layer.className).toContain("absolute");
    expect(layer.className).toContain("inset-0");
    const tile = layer.parentElement;
    expect(tile).not.toBeNull();
    expect(screen.getByText("e")).toBeInTheDocument();
    const nodes = Array.from(tile?.childNodes ?? []);
    const textNode = nodes.find((node) => node.nodeType === Node.TEXT_NODE);
    expect(textNode).toBeDefined();
    const layerIndex = nodes.indexOf(layer);
    const textIndex = textNode ? nodes.indexOf(textNode) : -1;
    expect(layerIndex).toBeGreaterThan(textIndex);
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
