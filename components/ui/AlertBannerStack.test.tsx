import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AlertBanner } from "./AlertBanner";
import { AlertBannerStack } from "./AlertBannerStack";

function banner(title: string) {
  return <AlertBanner key={title} tint="yellow" title={title} />;
}

describe("AlertBannerStack", () => {
  it("does not add an internal divider for one alert", () => {
    const { container } = render(<AlertBannerStack>{banner("One alert")}</AlertBannerStack>);

    expect(container.querySelector("output")?.parentElement).not.toHaveClass("border-b");
  });

  it("adds one divider between two alerts and none after the final alert", () => {
    const { container } = render(
      <AlertBannerStack>
        {banner("First alert")}
        {banner("Second alert")}
      </AlertBannerStack>,
    );

    const entries = Array.from(
      container.querySelectorAll("output"),
      (output) => output.parentElement,
    );
    expect(entries[0]).toHaveClass("border-b", "border-border");
    expect(entries[1]).not.toHaveClass("border-b");
    expect(container.querySelectorAll(".border-b")).toHaveLength(1);
  });
});
