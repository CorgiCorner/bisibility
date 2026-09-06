import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BackLink } from "./BackLink";

describe("BackLink", () => {
  it("uses a muted caret-left link", () => {
    render(<BackLink href="/app/prj_1/rank-tracker">All keywords</BackLink>);

    const link = screen.getByRole("link", { name: "All keywords" });
    expect(link).toHaveAttribute("href", "/app/prj_1/rank-tracker");
    expect(link).toHaveClass("text-fg-muted");
    expect(link.querySelector("svg")).toBeVisible();
  });
});
