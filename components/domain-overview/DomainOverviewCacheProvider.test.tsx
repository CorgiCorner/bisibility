import { renderWithDomainOverviewMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DomainOverviewCacheProvider } from "./DomainOverviewCacheProvider";
import { DomainOverviewPerformanceChart } from "./DomainOverviewPerformanceChart";
import { DomainOverviewStatePanel } from "./DomainOverviewStatePanel";

describe("domain overview cache copy", () => {
  it.each([
    [2_592_000, "30 days"],
    [900, "15 minutes"],
  ])("uses the %i-second cache window throughout new lookup", (ttlSeconds, duration) => {
    render(
      <DomainOverviewCacheProvider ttlSeconds={ttlSeconds}>
        <DomainOverviewStatePanel projectRef="prj_1" state="idle" />
        <DomainOverviewPerformanceChart history={null} loading={false} onLoad={() => undefined} />
      </DomainOverviewCacheProvider>,
    );

    expect(
      screen.getByText(`Results cached for ${duration}, repeat lookups are free`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `History is cached for ${duration}. Switching metrics and ranges after loading is free.`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/12 hours/)).not.toBeInTheDocument();
  });
});
