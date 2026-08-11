import { UsageCardsLoading } from "@/components/settings/usage/UsageLoading";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("UsageCardsLoading", () => {
  it("keeps one loader frame for each settled card", () => {
    const { container } = render(<UsageCardsLoading />);

    expect(container.querySelectorAll("[data-settings-loading-frame]")).toHaveLength(2);
    expect(container.querySelector('[data-settings-loading-frame="plan"]')).toBeInTheDocument();
    expect(
      container.querySelector('[data-settings-loading-frame="provider-usage"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-usage-loading-footer="provider-usage"]'),
    ).toBeInTheDocument();
  });
});
