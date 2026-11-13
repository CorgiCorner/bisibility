import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnnotationsLoading } from "./AnnotationsLoading";
import { annotationsBlocks, annotationsLayoutClassName } from "./annotations-layout";

describe("annotations loading", () => {
  it("mirrors the board block list", () => {
    const { container } = render(<AnnotationsLoading />);
    const root = container.querySelector("[data-annotations-blocks]");
    expect(root).toHaveAttribute("data-annotations-blocks", annotationsBlocks.join(" "));
    expect(root).toHaveClass(...annotationsLayoutClassName.split(" "));
    expect(
      [...container.querySelectorAll("[data-annotations-section]")].map((node) =>
        node.getAttribute("data-annotations-section"),
      ),
    ).toEqual([...annotationsBlocks]);
  });
});
