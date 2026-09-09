import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GithubStars } from "./GithubStars";

describe("GithubStars", () => {
  it.each([null, undefined])("keeps the repository link when the count is %s", (count) => {
    render(<GithubStars count={count} />);

    const link = screen.getByRole("link", { name: "GitHub repository" });
    expect(link).toHaveAttribute("href", "https://github.com/CorgiCorner/bisibility");
    expect((link.textContent ?? "").replace(/\s+/g, " ").trim()).not.toMatch(/\d/);
    expect(link.querySelectorAll("svg")).toHaveLength(1);
  });

  it("renders GitHub before the current count without star glyphs", () => {
    render(<GithubStars count="42" />);

    const link = screen.getByRole("link", { name: "42 stars on GitHub" });
    expect(link).toHaveTextContent("GitHub42");
    expect(link.querySelectorAll("svg")).toHaveLength(1);
    expect(link.querySelector("svg")).not.toHaveClass("text-yellow-text");
    expect(link.querySelector("span:last-child")).toHaveClass("opacity-70", "font-semibold");
  });

  it("uses normal weight in nav while keeping chip weight semibold", () => {
    const { rerender } = render(<GithubStars count="42" variant="nav" />);

    expect(screen.getByRole("link", { name: "42 stars on GitHub" })).toHaveClass("font-normal");

    rerender(<GithubStars count="42" variant="chip" />);
    expect(screen.getByRole("link", { name: "42 stars on GitHub" })).toHaveClass("font-semibold");
  });

  it("keeps compact thousands formatting after the GitHub label", () => {
    render(<GithubStars count="1200" />);

    expect(screen.getByRole("link", { name: "1.2k stars on GitHub" })).toHaveTextContent(
      "GitHub1.2k",
    );
  });
});
