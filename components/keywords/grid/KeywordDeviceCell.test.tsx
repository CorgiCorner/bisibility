import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { KeywordRow } from "@/lib/queries/keywords";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeywordDeviceCell } from "./KeywordDeviceCell";

const row = { ...(keywordRows[0] as KeywordRow), device: "desktop" };

describe("KeywordDeviceCell", () => {
  it("centers the device icon with the keyword text", () => {
    render(<KeywordDeviceCell projectRef="prj_test" row={row} showDevice />);

    const trigger = screen.getByRole("button", { name: "Desktop" });
    expect(trigger).toHaveClass("flex", "shrink-0", "items-center");
    expect(trigger).not.toHaveClass("block");
  });
});
