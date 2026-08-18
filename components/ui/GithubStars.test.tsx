import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GithubStars } from "./GithubStars";

describe("GithubStars", () => {
  it.each([null, undefined])("keeps the repository link when the count is %s", (count) => {
    render(<GithubStars count={count} />);

    const link = screen.getByRole("link", { name: "GitHub repository" });
    expect(link).toHaveAttribute("href", "https://github.com/CorgiCorner/bisibility");
    expect(link).not.toHaveTextContent(/\d/);
    expect(link.querySelectorAll("svg")).toHaveLength(1);
  });

  it("renders the current count with the repository link", () => {
    render(<GithubStars count="42" />);

    expect(screen.getByRole("link", { name: "42 stars on GitHub" })).toHaveTextContent("42");
  });

  it("keeps compact thousands formatting", () => {
    render(<GithubStars count="1200" />);

    expect(screen.getByRole("link", { name: "1.2k stars on GitHub" })).toHaveTextContent("1.2k");
  });

  it("cross-fades only for fine pointers and leaves keyboard focus ring-only", () => {
    render(<GithubStars count="1200" />);

    const link = screen.getByRole("link", { name: "1.2k stars on GitHub" });
    const glyphClasses = Array.from(link.querySelectorAll("svg"))
      .map((glyph) => glyph.getAttribute("class") ?? "")
      .join(" ");

    expect(glyphClasses).toContain("pointer-fine:group-hover:opacity-0");
    expect(glyphClasses).toContain("pointer-fine:group-hover:opacity-100");
    expect(glyphClasses).toContain("duration-[var(--motion-press)]");
    expect(glyphClasses).not.toContain("group-focus-visible");
    expect(glyphClasses).not.toMatch(/scale-(?:90|110)/);
    expect(link).toHaveClass("focus-visible:outline-2");
  });
});
