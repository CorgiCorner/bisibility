import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccentCtaLink } from "./AccentCtaLink";

describe("AccentCtaLink", () => {
  it("keeps a trailing caret on the solid 40px connect chrome", () => {
    render(<AccentCtaLink href="/app/prj_1/integrations">Connect DataForSEO</AccentCtaLink>);

    const link = screen.getByRole("link", { name: "Connect DataForSEO" });
    expect(link).toHaveAttribute("href", "/app/prj_1/integrations");
    expect(link).toHaveClass("bg-accent-solid", "rounded-control", "gap-[7px]", "py-2.5");
    const icon = link.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });
});
