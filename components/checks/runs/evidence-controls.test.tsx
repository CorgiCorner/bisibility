import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { projectionKeys } from "@/lib/provider-evidence/projection/model";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CheckRunsHeader } from "./CheckRunsControls";
import { EvidenceProjectionBands } from "./EvidenceProjectionBands";
import { ExactRangeControl } from "./ExactRangeControl";
import { SkippedRunsView } from "./SkippedRunsView";

const now = new Date("2026-10-23T07:00:00Z");
describe("UI-3/UI-4 controls", () => {
  it.each(projectionKeys)("renders and filters %s separately from deferral codes", (key) => {
    const action = vi.fn();
    render(<EvidenceProjectionBands counts={{ [key]: 3 }} onFilterChange={action} />);
    expect(screen.getByText(/· 3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View checks" }));
    expect(action).toHaveBeenCalledWith(key);
  });
  it("keeps the raw unknown reason count", () => {
    render(
      <SkippedRunsView
        exactRange
        groups={[
          {
            reason: "other",
            rawReason: "future_reason",
            count: 7,
            keywordCount: 4,
            firstAt: now.toISOString(),
            lastAt: now.toISOString(),
          },
        ]}
        links={{ connectProviderHref: "/", reviewProvidersHref: "/", timelineHref: "/" }}
        now={now}
        range="7d"
        timeZone="UTC"
      />,
    );
    expect(screen.getByText("Other · 7")).toBeInTheDocument();
    expect(screen.getByText("future_reason")).toBeInTheDocument();
    expect(screen.queryByText(/Skipped runs never started/)).not.toBeInTheDocument();
    expect(screen.getByText(/may already have been submitted/)).toHaveTextContent("selected range");
  });
  it("shows invalid range inline and validates custom entry in the viewer zone", async () => {
    const apply = vi.fn();
    const { container } = render(
      <ExactRangeControl
        value={{ from: "2026-10-23T06:00:00Z", to: "2026-10-23T07:00:00Z" }}
        now={now}
        timeZone="Europe/Warsaw"
        onApply={apply}
        error
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("90 days");
    fireEvent.click(screen.getByRole("button", { name: "Custom range" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("From")).toHaveValue("10/23/2026, 08:00:00 +02:00");
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    await vi.waitFor(() =>
      expect(apply).toHaveBeenCalledWith({
        from: "2026-10-23T06:00:00.000Z",
        to: "2026-10-23T07:00:00.000Z",
      }),
    );
    expect(container.querySelector("select")).toBeNull();
  });
  it("uses the design system trigger menu including programmatic", () => {
    const { container } = render(
      <CheckRunsHeader
        asOfDate="2026-10-23"
        now={now}
        onAsOfDateChange={vi.fn()}
        onProviderChange={vi.fn()}
        onRangeChange={vi.fn()}
        onTriggerChange={vi.fn()}
        provider="all"
        providerOptions={[]}
        range="7d"
        timeZone="UTC"
        trigger="programmatic"
      />,
    );
    expect(screen.getByRole("button", { name: /Filter by trigger/ })).toHaveTextContent(
      "Programmatic",
    );
    expect(container.querySelector("select")).toBeNull();
  });
});
