import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UsagePageLoading } from "./UsagePageLoading";
import { usageBlocks, usagePageClassName } from "./usage-page-layout";

describe("usage page loading", () => {
  it("starts with the cost tiles and does not draw a zero amount", () => {
    const { container } = render(<UsagePageLoading />);
    expect(container.querySelector("[data-usage-blocks]")).toHaveAttribute(
      "data-usage-blocks",
      usageBlocks.join(" "),
    );
    expect(container.firstElementChild).toHaveClass(...usagePageClassName.split(" "));
    expect(
      [...container.querySelectorAll("[data-usage-section]")].map((node) =>
        node.getAttribute("data-usage-section"),
      ),
    ).toEqual(["tiles", "billing", "subscriptions"]);
    expect(container.textContent).not.toContain("$0.00");
  });
});
