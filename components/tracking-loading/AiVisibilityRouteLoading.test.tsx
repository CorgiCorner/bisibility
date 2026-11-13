import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiVisibilityRouteLoading } from "./AiVisibilityRouteLoading";
import {
  aiVisibilityBlocks,
  aiVisibilityLayoutClassName,
  aiVisibilityRunsBlocks,
} from "./ai-visibility-layout";

const tabs = ["overview", "prompts", "research", "sources", "engines"] as const;

describe("AI Visibility route loading", () => {
  it.each(tabs)("mirrors the %s block list", (tab) => {
    const { container } = render(<AiVisibilityRouteLoading tab={tab} />);
    const root = container.querySelector("[data-visibility-tab]");
    expect(root).toHaveAttribute("data-visibility-blocks", aiVisibilityBlocks[tab].join(" "));
    expect(root).toHaveAttribute("data-visibility-tab", tab);
    expect(root).toHaveClass(...aiVisibilityLayoutClassName[tab].split(" "));
    expect(
      [...container.querySelectorAll("[data-visibility-section]")].map((node) =>
        node.getAttribute("data-visibility-section"),
      ),
    ).toEqual([...aiVisibilityBlocks[tab]]);
    expect(container.querySelector("[data-provider-locked]")).toBeNull();
  });

  it("mirrors run history when the prompts tab is on that view", () => {
    const { container } = render(<AiVisibilityRouteLoading tab="prompts" view="runs" />);
    expect(container.querySelector("[data-visibility-blocks]")).toHaveAttribute(
      "data-visibility-blocks",
      aiVisibilityRunsBlocks.join(" "),
    );
    expect(container.querySelector("[data-visibility-view]")).toHaveAttribute(
      "data-visibility-view",
      "runs",
    );
  });
});
