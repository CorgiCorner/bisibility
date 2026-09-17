import { domainOverviewHistoryFixture } from "@/components/domain-overview/fixtures";
import { renderWithDomainOverviewMessages } from "@/i18n/test-support/render-with-feature-messages";
import { stubResizeObserver } from "@/tests/observers";
import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DomainOverviewPerformanceChart } from "./DomainOverviewPerformanceChart";

describe("DomainOverviewPerformanceChart date axis", () => {
  it("keeps the provider month key internally but shows an ISO month, not an invented day", () => {
    const observers = stubResizeObserver();
    renderWithDomainOverviewMessages(
      <DomainOverviewPerformanceChart history={domainOverviewHistoryFixture} loading={false} />,
      { dateFormat: "iso" },
    );

    act(() => {
      for (const controller of observers) {
        controller.trigger([{ contentRect: { height: 260, width: 760 } } as ResizeObserverEntry]);
      }
    });

    expect(screen.getByText("2026-08")).toBeInTheDocument();
    expect(screen.queryByText("2026-08-01")).not.toBeInTheDocument();
  });
});
