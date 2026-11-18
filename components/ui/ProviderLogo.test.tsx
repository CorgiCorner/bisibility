import { applyTheme, readThemePreference } from "@/lib/theme/browser-theme";
import { act, fireEvent, render, screen } from "@testing-library/react";
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

it("preserves transparent artwork in the bare appearance without changing default tiles", () => {
  vi.stubEnv("NEXT_PUBLIC_LOGODEV_TOKEN", "test-token");
  const { container, rerender } = render(
    <ProviderLogo
      alt="Provider"
      domain="example.com"
      fallbackIcon="globe"
      tint="#000"
      appearance="bare"
    />,
  );
  expect(screen.getByRole("img", { name: "Provider" })).toHaveClass("bg-transparent");
  expect(container.querySelector("img")).toHaveClass("bg-transparent");
  expect(container.querySelector("img")).not.toHaveClass("bg-white");
  rerender(<ProviderLogo alt="Provider" domain="example.com" fallbackIcon="globe" tint="#000" />);
  expect(container.querySelector("img")).toHaveClass("bg-white");
  vi.unstubAllEnvs();
});

it("follows the application theme in auto mode and retains ordinary provider logos by default", () => {
  vi.stubEnv("NEXT_PUBLIC_LOGODEV_TOKEN", "test-token");
  const previous = readThemePreference();
  act(() => applyTheme("dark"));
  const view = render(
    <ProviderLogo
      alt="Provider"
      domain="example.com"
      fallbackIcon="globe"
      tint="#000"
      appearance="bare"
      theme="auto"
    />,
  );
  const imageUrl = () => {
    const image = view.container.querySelector("img");
    if (!image) throw new Error("Expected provider logo image");
    return new URL(image.src);
  };
  try {
    expect(imageUrl().searchParams.get("theme")).toBe("dark");
    act(() => applyTheme("light"));
    expect(imageUrl().searchParams.get("theme")).toBe("light");
    view.rerender(
      <ProviderLogo alt="Provider" domain="example.com" fallbackIcon="globe" tint="#000" />,
    );
    expect(imageUrl().searchParams.has("theme")).toBe(false);
  } finally {
    view.unmount();
    act(() => applyTheme(previous));
    vi.unstubAllEnvs();
  }
});

it("uses official theme artwork for OpenRouter and retains the ordinary tile", () => {
  vi.stubEnv("NEXT_PUBLIC_LOGODEV_TOKEN", "test-token");
  const props = {
    alt: "OpenRouter",
    domain: "openrouter.ai",
    fallbackIcon: "globe" as const,
    tint: "#7c3aed",
  };
  const view = render(<ProviderLogo {...props} appearance="bare" theme="dark" />);
  expect(view.container.querySelector("img")).toHaveAttribute(
    "src",
    "/brand/providers/openrouter-cloud.svg",
  );
  view.rerender(<ProviderLogo {...props} appearance="bare" theme="light" />);
  expect(view.container.querySelector("img")).toHaveAttribute(
    "src",
    "/brand/providers/openrouter-ink.svg",
  );
  view.rerender(<ProviderLogo {...props} />);
  expect(view.container.querySelector("img")?.getAttribute("src")).toContain(
    "img.logo.dev/openrouter.ai",
  );
  vi.unstubAllEnvs();
});
