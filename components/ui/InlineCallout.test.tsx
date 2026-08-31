import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InlineCallout, type InlineCalloutTint } from "./InlineCallout";

describe("InlineCallout", () => {
  it("uses a structural border for neutral callouts", () => {
    render(<InlineCallout tint="neutral">Context</InlineCallout>);

    const callout = screen.getByRole("alert", { name: "Context" });
    expect(callout).toHaveClass("border-border");
    expect(callout).not.toHaveClass("border-border-control");
  });

  it.each([
    ["red", "border-red"],
    ["yellow", "border-yellow"],
  ] satisfies ReadonlyArray<readonly [InlineCalloutTint, string]>)(
    "preserves the %s semantic border",
    (tint, borderClass) => {
      render(<InlineCallout tint={tint}>{tint}</InlineCallout>);

      expect(screen.getByRole("alert", { name: tint })).toHaveClass(borderClass);
    },
  );
});
