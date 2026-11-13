import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConversionsSettingsLoading } from "./ConversionsSettingsLoading";
import {
  conversionsSettingsBlocks,
  conversionsSettingsLayoutClassName,
} from "./conversions-settings-layout";

describe("conversions settings loading", () => {
  it("mirrors the intro, sources and goals and skips the optional comparison", () => {
    const { container } = render(<ConversionsSettingsLoading />);
    const root = container.querySelector("[data-conversions-blocks]");
    expect(root).toHaveAttribute("data-conversions-blocks", conversionsSettingsBlocks.join(" "));
    expect(root).toHaveClass(...conversionsSettingsLayoutClassName.split(" "));
    expect(container.querySelectorAll("[data-conversions-section]")).toHaveLength(3);
  });
});
