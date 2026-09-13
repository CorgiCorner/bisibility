import { CountryFlag } from "@/components/keywords/CountryFlag";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("CountryFlag", () => {
  it("references the shared sprite instead of inlining a flag", () => {
    const { container } = render(<CountryFlag code="us" />);

    const flag = container.querySelector("[data-country-flag='US']");
    expect(flag).toBeInTheDocument();
    expect(flag?.querySelector("use")).toHaveAttribute("href", "/flags.svg#us");
    expect(flag).toHaveAttribute("aria-hidden", "true");
  });

  it("names the flag for assistive technology when a title is given", () => {
    const { container } = render(<CountryFlag code="PL" title="Poland" />);

    const flag = container.querySelector("[data-country-flag='PL']");
    expect(flag).toHaveAttribute("role", "img");
    expect(flag).not.toHaveAttribute("aria-hidden");
    expect(flag?.querySelector("title")).toHaveTextContent("Poland");
  });

  it("falls back to the globe for a code the sprite does not carry", () => {
    const { container } = render(<CountryFlag code="ZZ" />);

    expect(container.querySelector("[data-country-flag='ZZ']")).toBeNull();
    expect(container.querySelector("[data-country-flag-fallback='ZZ']")).toBeInTheDocument();
  });

  it("renders nothing when the caller opted out of a fallback", () => {
    const { container } = render(<CountryFlag code="ZZ" fallback="none" />);

    expect(container).toBeEmptyDOMElement();
  });
});
