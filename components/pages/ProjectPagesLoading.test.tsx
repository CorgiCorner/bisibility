import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectPagesLoading } from "./ProjectPagesLoading";
import { projectPagesBlocks, projectPagesLayoutClassName } from "./project-pages-layout";

const tabs = ["all", "by-tag", "existing-vs-new", "compare"] as const;

describe("project pages loading", () => {
  it.each(tabs)("mirrors the %s block list", (tab) => {
    const { container } = render(<ProjectPagesLoading tab={tab} />);
    const root = container.querySelector("[data-pages-tab]");
    expect(root).toHaveAttribute("data-pages-blocks", projectPagesBlocks[tab].join(" "));
    expect(root).toHaveClass(...projectPagesLayoutClassName.split(" "));
    expect(
      [...container.querySelectorAll("[data-pages-section]")].map((node) =>
        node.getAttribute("data-pages-section"),
      ),
    ).toEqual([...projectPagesBlocks[tab]]);
  });
});
