import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderLogo } from "./ProviderLogo";

function wrapper(alt: string): HTMLElement {
  return screen.getByRole("img", { name: alt });
}

describe("ProviderLogo", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exposes a single accessible image named by alt while the remote image loads", () => {
    vi.stubEnv("NEXT_PUBLIC_LOGODEV_TOKEN", "test-token");
    const { container } = render(
      <ProviderLogo
        alt="Example provider logo"
        domain="example.com"
        fallbackIcon="globe"
        tint="#123456"
      />,
    );

    const accessible = wrapper("Example provider logo");
    expect(accessible.tagName).toBe("SPAN");
    expect(accessible).toHaveAttribute("aria-label", "Example provider logo");

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("src", expect.stringContaining("fallback=404"));
  });

  it("keeps exactly one accessible image with the same name after a remote image error", () => {
    vi.stubEnv("NEXT_PUBLIC_LOGODEV_TOKEN", "test-token");
    const { container } = render(
      <ProviderLogo
        alt="Example provider logo"
        domain="example.com"
        fallbackIcon="globe"
        tint="#123456"
      />,
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);

    const accessible = screen.getAllByRole("img", { name: "Example provider logo" });
    expect(accessible).toHaveLength(1);
    expect(accessible[0]).toHaveAttribute("aria-label", "Example provider logo");

    expect(container.querySelector("img")).toBeNull();
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("renders the fallback as a single accessible image before any remote load", () => {
    const { container } = render(
      <ProviderLogo alt="Acme" domain={null} fallbackIcon="database" tint="#000000" />,
    );

    const accessible = screen.getAllByRole("img", { name: "Acme" });
    expect(accessible).toHaveLength(1);
    expect(accessible[0]).toHaveAttribute("aria-label", "Acme");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
