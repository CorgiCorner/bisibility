import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DomainOverviewPageLoading,
  DomainOverviewResultsLoading,
} from "./DomainOverviewLoadingSkeletons";

describe("DomainOverviewLoadingSkeletons", () => {
  it("mirrors the common route page with analyze and idle panel geometry", () => {
    const { container } = render(<DomainOverviewPageLoading />);
    const route = screen.getByLabelText("Domain Overview page loading");
    const analyzeCard = route.querySelector('[data-skeleton="analyze-card"]');
    const target = route.querySelector('[data-skeleton="target-control"]');
    const marketWrapper = route.querySelector('[data-skeleton="market-wrapper"]');
    const market = route.querySelector('[data-skeleton="market-control"]');
    const action = route.querySelector('[data-skeleton="analyze-action"]');
    const idlePanel = route.querySelector('[data-skeleton="idle-panel"]');

    expect(route).toHaveAttribute("aria-busy", "true");
    expect(route).toHaveClass("grid", "min-w-0", "gap-4");
    expect(analyzeCard).toHaveClass(
      "rounded-[14px]",
      "border",
      "border-border",
      "bg-bg-elev",
      "p-4.5",
      "sm:p-5",
    );
    expect(target).toHaveClass(
      "h-10",
      "flex-1",
      "rounded-[9px]",
      "border-border-strong",
      "md:min-w-[320px]",
    );
    expect(marketWrapper).toHaveClass("md:w-[230px]");
    expect(market).toHaveClass("h-10", "w-full", "rounded-[9px]", "border-border-strong");
    expect(action).toHaveClass("h-[37px]", "min-w-[200px]");
    expect(idlePanel).toHaveClass(
      "rounded-2xl",
      "border",
      "border-border",
      "bg-bg-elev",
      "px-8",
      "py-11",
    );
    expect(idlePanel?.className).not.toMatch(/(?:min-)?h-/);
    expect(idlePanel?.querySelector('[data-skeleton="idle-icon"]')).toHaveClass(
      "h-[54px]",
      "w-[54px]",
    );
    expect(idlePanel?.querySelectorAll('[data-skeleton="idle-bullet"]')).toHaveLength(3);

    expect(container.querySelectorAll('[class~="rounded-[13px]"]')).toHaveLength(0);
    expect(
      container.querySelectorAll('[class~="min-w-[1180px]"], [class~="min-w-[900px]"]'),
    ).toHaveLength(0);
  });

  it("keeps the complete results hierarchy and busy region", () => {
    const { container } = render(<DomainOverviewResultsLoading />);

    expect(screen.getByLabelText("Domain Overview loading")).toHaveAttribute("aria-busy", "true");
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(30);
    expect(container.querySelectorAll('[class~="rounded-[13px]"]')).toHaveLength(6);
    expect(
      container.querySelectorAll('[class~="min-w-[1180px]"], [class~="min-w-[900px]"]'),
    ).toHaveLength(2);
  });
});
