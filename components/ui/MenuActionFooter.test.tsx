import {
  menuActionFooterActionGapPx,
  menuActionFooterDividerGapPx,
  menuActionFooterOuterBottomCompensationPx,
  menuActionFooterVisibleGaps,
} from "@/components/ui/MenuActionFooter";
import { describe, expect, it } from "vitest";

describe("MenuActionFooter geometry", () => {
  it("reserves a structural gap before its full-bleed divider", () => {
    expect(menuActionFooterDividerGapPx).toBe(6);
  });

  it("cancels the menu list and paper bottom padding exactly once", () => {
    const measured = menuActionFooterVisibleGaps({
      actionPaddingPx: menuActionFooterActionGapPx,
      footerBottomMarginPx: -menuActionFooterOuterBottomCompensationPx,
      listBottomPaddingPx: 8,
      paperBottomPaddingPx: 6,
    });

    expect(measured).toEqual({ dividerToButtonPx: 6, buttonToInnerBottomPx: 6 });
    expect(
      Math.abs(measured.dividerToButtonPx - measured.buttonToInnerBottomPx),
    ).toBeLessThanOrEqual(1);
  });

  it("detects the screenshot state that canceled only paper padding", () => {
    const screenshotState = menuActionFooterVisibleGaps({
      actionPaddingPx: 6,
      footerBottomMarginPx: -6,
      listBottomPaddingPx: 8,
      paperBottomPaddingPx: 6,
    });

    expect(screenshotState).toEqual({ dividerToButtonPx: 6, buttonToInnerBottomPx: 14 });
    expect(
      Math.abs(screenshotState.dividerToButtonPx - screenshotState.buttonToInnerBottomPx),
    ).toBe(8);
  });
});
