import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompetitorTile } from "./CompetitorTile";

describe("CompetitorTile", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps competitor initials until a square 32px domain favicon is verified", () => {
    const { container } = render(<CompetitorTile domain="example.org" initials="EO" />);

    expect(screen.getByText("EO")).toBeInTheDocument();
    expect(screen.queryByTestId("competitor-tile-favicon")).not.toBeInTheDocument();
    const probe = screen.getByTestId("competitor-tile-favicon-probe");
    Object.defineProperties(probe, {
      naturalHeight: { configurable: true, value: 32 },
      naturalWidth: { configurable: true, value: 32 },
    });
    fireEvent.load(probe);
    expect(screen.getByTestId("competitor-tile-favicon")).toHaveStyle({
      backgroundImage: 'url("https://www.google.com/s2/favicons?domain=example.org&sz=32")',
      backgroundSize: "cover",
    });
    expect(container.innerHTML).not.toContain("logo.dev");
  });

  it("keeps competitor initials when the favicon service returns a smaller fallback image", () => {
    render(<CompetitorTile domain="example.org" initials="EO" />);

    const probe = screen.getByTestId("competitor-tile-favicon-probe");
    Object.defineProperties(probe, {
      naturalHeight: { configurable: true, value: 16 },
      naturalWidth: { configurable: true, value: 16 },
    });
    fireEvent.load(probe);

    expect(screen.getByText("EO")).toBeInTheDocument();
    expect(screen.queryByTestId("competitor-tile-favicon")).not.toBeInTheDocument();
  });

  it("keeps competitor initials without a domain request when opted out", () => {
    vi.stubEnv("NEXT_PUBLIC_DOMAIN_ICONS", "off");
    render(<CompetitorTile domain="example.org" initials="EO" />);

    expect(screen.getByText("EO")).toBeInTheDocument();
    expect(screen.queryByTestId("competitor-tile-favicon-probe")).not.toBeInTheDocument();
    expect(screen.queryByTestId("competitor-tile-favicon")).not.toBeInTheDocument();
  });
});
