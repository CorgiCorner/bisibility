import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SafeMarkdown } from "./SafeMarkdown";

vi.mock("@/components/ui/CopyButton", () => ({
  CopyButton: () => <button type="button">Copy</button>,
}));

describe("SafeMarkdown", () => {
  it("keeps HTML, scripts, images and unsafe links inert", () => {
    const { container } = render(
      <SafeMarkdown
        text={
          "<script>alert(1)</script> <b>text</b> ![x](https://example.com/x.png) [bad](javascript:alert) [good](https://example.com)"
        }
      />,
    );
    expect(container.querySelector("script, b, img")).toBeNull();
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(container.textContent).toContain("[bad](javascript:alert)");
    expect(container.querySelector("a")?.getAttribute("rel")).toBe("noopener noreferrer");
  });
  it("renders code and tables without HTML tables", () => {
    const { container } = render(
      <SafeMarkdown
        text={"# Heading\n\n```js\n<script>\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |"}
      />,
    );
    // A Markdown h1 nests below the panel h2, so it renders as h3.
    expect(screen.getByRole("heading", { level: 3 })).toBeTruthy();
    expect(container.querySelector("table, script")).toBeNull();
    expect(container.querySelectorAll("pre")).toHaveLength(2);
  });
});
