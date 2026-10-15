import { renderWithDomainOverviewMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DomainOverviewPageLoading,
  DomainOverviewResultsLoading,
} from "./DomainOverviewLoadingSkeletons";

describe("DomainOverviewLoadingSkeletons", () => {
  it("mirrors the common route page with analyze and idle panel geometry", () => {
    const { container } = render(
      <DomainOverviewPageLoading ariaLabel="Domain Overview page loading" />,
    );
    const route = screen.getByLabelText("Domain Overview page loading");
    const analyzeCard = route.querySelector('[data-skeleton="analyze-card"]');
    const target = route.querySelector('[data-skeleton="target-control"]');
    const scopeWrapper = route.querySelector('[data-skeleton="scope-wrapper"]');
    const scope = route.querySelector('[data-skeleton="scope-control"]');
    const action = route.querySelector('[data-skeleton="analyze-action"]');
    const idlePanel = route.querySelector("[data-empty-state]");
    expect(route).toHaveAttribute("aria-busy", "true");
    expect(analyzeCard).toBeInTheDocument();
    expect(target).toBeInTheDocument();
    expect(scopeWrapper).toBeInTheDocument();
    expect(scope).toBeInTheDocument();
    expect(action).toBeInTheDocument();
    expect(route.querySelector('[data-skeleton="scope-footer"]')).toBeInTheDocument();
    expect(idlePanel?.querySelectorAll("[data-empty-state-bullet]")).toHaveLength(3);
    expect(container.querySelector("input,button,a")).toBeNull();
  });

  it("keeps the complete results hierarchy and busy region", () => {
    const { container } = render(
      <DomainOverviewResultsLoading ariaLabel="Domain Overview loading" />,
    );

    expect(screen.getByLabelText("Domain Overview loading")).toHaveAttribute("aria-busy", "true");
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(30);
    expect(container.querySelectorAll('[class~="rounded-card"]')).toHaveLength(11);
    expect(
      container.querySelectorAll('[class~="min-w-[1180px]"], [class~="min-w-[900px]"]'),
    ).toHaveLength(2);
  });
});
