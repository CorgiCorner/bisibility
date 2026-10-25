import indicatorMeta from "@/components/shell/RealtimeIndicator.stories";
import { renderWithShellMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import bannerMeta from "./NewResultsBanner.stories";

const IndicatorStory = indicatorMeta.component;
const HeldUpdateStory = bannerMeta.component;
describe("live update stories", () => {
  it.each(["live", "reconnecting"] as const)("renders the %s indicator story", (status) => {
    render(<IndicatorStory status={status} />);
    expect(screen.getByText(status === "live" ? "Live" : "Reconnecting")).toBeInTheDocument();
  });
  it("starts with held results and shows the new row on activation", () => {
    render(<HeldUpdateStory />);
    expect(screen.getByText("New results")).toBeVisible();
    expect(screen.queryByText("New result")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getByText("New result")).toBeVisible();
    expect(screen.getByLabelText("Results")).toHaveFocus();
  });
});
