import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderLogo } from "./ProviderLogo";

describe("ProviderLogo", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the 404 fallback parameter and falls back to its icon after an image error", () => {
    vi.stubEnv("NEXT_PUBLIC_LOGODEV_TOKEN", "test-token");
    const { container } = render(
      <ProviderLogo
        alt="Example provider logo"
        domain="example.com"
        fallbackIcon="globe"
        tint="#123456"
      />,
    );

    const image = screen.getByRole("img", { name: "Example provider logo" });
    expect(image).toHaveAttribute("src", expect.stringContaining("fallback=404"));

    fireEvent.error(image);

    expect(screen.queryByRole("img", { name: "Example provider logo" })).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
