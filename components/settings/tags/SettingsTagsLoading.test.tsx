import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SettingsTagsLoading } from "./SettingsTagsLoading";
import { settingsTagsBlocks, settingsTagsLayoutClassName } from "./settings-tags-layout";

describe("settings tags loading", () => {
  it("mirrors the header, table and where-used note", () => {
    const { container } = render(<SettingsTagsLoading />);
    const root = container.querySelector("[data-settings-tags-blocks]");
    expect(root).toHaveAttribute("data-settings-tags-blocks", settingsTagsBlocks.join(" "));
    expect(root).toHaveClass(...settingsTagsLayoutClassName.split(" "));
    expect(
      [...container.querySelectorAll("[data-settings-tags-section]")].map((node) =>
        node.getAttribute("data-settings-tags-section"),
      ),
    ).toEqual([...settingsTagsBlocks]);
  });
});
