import type { ResearchScope } from "@/lib/research/scope";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DomainOverviewAnalyzeCard } from "./DomainOverviewAnalyzeCard";
import { domainOverviewScopeFixture } from "./fixtures";

const estimate = {
  cached: false,
  costCents: 4,
  freshCostCents: 6,
  historyCostCents: 12,
  keywordPageCostCents: 2,
  loading: false,
  pagePageCostCents: 3,
  valid: true,
};

const germanyScope: ResearchScope = {
  countryCode: "DE",
  countryName: "Germany",
  languageCode: "de",
  languageLabel: "German",
  providerLocationCode: 2276,
  researchAvailable: true,
};

const unavailableScope: ResearchScope = {
  countryCode: "ES",
  countryName: "Spain",
  languageCode: "eu",
  languageLabel: "Basque",
  providerLocationCode: 2724,
  researchAvailable: false,
};

const searchableCatalogScopes: ResearchScope[] = [
  unavailableScope,
  ...(
    [
      ["FR", "France", 2250],
      ["IT", "Italy", 2380],
      ["PT", "Portugal", 2620],
      ["BE", "Belgium", 2056],
      ["NL", "Netherlands", 2528],
      ["SE", "Sweden", 2752],
    ] as const
  ).map(([countryCode, countryName, providerLocationCode]) => ({
    ...domainOverviewScopeFixture,
    countryCode,
    countryName,
    providerLocationCode,
  })),
];

function renderCard(
  trackedScopes: readonly ResearchScope[],
  onResearchScopeChange = vi.fn(),
  catalogScopes: readonly ResearchScope[] = [unavailableScope],
) {
  render(
    <DomainOverviewAnalyzeCard
      catalogScopes={catalogScopes}
      estimate={estimate}
      onResearchScopeChange={onResearchScopeChange}
      onScopeChange={vi.fn()}
      onSubmit={vi.fn()}
      onTargetChange={vi.fn()}
      researchScope={domainOverviewScopeFixture}
      submitting={false}
      target="example.com"
      trackedScopes={trackedScopes}
    />,
  );
  return onResearchScopeChange;
}

describe("DomainOverviewAnalyzeCard country picker", () => {
  it("fills the desktop picker wrapper and shows the selected country flag", () => {
    renderCard([domainOverviewScopeFixture]);

    const trigger = screen.getByRole("button", { name: "Country: United States" });
    expect(trigger).toHaveClass("h-[34px]", "min-h-[34px]", "w-full");
    expect(trigger).not.toHaveClass("h-10", "min-h-10");
    expect(trigger.parentElement).toHaveClass("w-full");
    expect(trigger.parentElement?.parentElement).toHaveClass("md:w-[230px]");
    expect(trigger.querySelector("[data-country-flag='US']")).toBeInTheDocument();
  });

  it("uses the exact change tooltip", async () => {
    const user = userEvent.setup();
    renderCard([domainOverviewScopeFixture]);
    const trigger = screen.getByRole("button", { name: "Country: United States" });

    await user.hover(trigger);
    expect(await screen.findByText("Change country")).toBeInTheDocument();
  });

  it("keeps the domain target within the exact compact control height", () => {
    renderCard([domainOverviewScopeFixture]);

    const target = screen.getByRole("textbox", { name: "Domain or subdomain" });
    expect(target.parentElement).toHaveClass("h-[34px]", "min-h-[34px]");
    expect(target).toHaveClass(
      "h-full",
      "min-h-0",
      "py-1",
      "compact-text-12",
      "text-[12px]",
      "leading-4",
      "placeholder:text-[12px]",
      "placeholder:leading-4",
    );
    expect(target).not.toHaveClass("h-10", "min-h-10");
  });

  it("uses the neutral subdomain example in the domain placeholder", () => {
    renderCard([domainOverviewScopeFixture]);

    expect(screen.getByRole("textbox", { name: "Domain or subdomain" })).toHaveAttribute(
      "placeholder",
      "Enter any domain or subdomain, e.g. blog.acme.example.com",
    );
  });

  it("preserves tracked scope payloads and exposes unavailable reasons", async () => {
    const user = userEvent.setup();
    const onResearchScopeChange = renderCard(
      [domainOverviewScopeFixture, germanyScope],
      vi.fn(),
      searchableCatalogScopes,
    );
    const trigger = screen.getByRole("button", { name: "Country: United States" });

    await user.click(trigger);
    const germany = screen.getByRole("menuitem", { name: /Germany/ });
    expect(germany).not.toHaveAttribute("title");
    await user.click(germany);
    expect(onResearchScopeChange).toHaveBeenCalledWith(germanyScope);

    await user.click(trigger);
    await user.type(screen.getByRole("textbox", { name: "Search countries" }), "spain");
    const unavailable = screen.getByRole("menuitem", { name: /Spain/ });
    expect(unavailable).toHaveAttribute("aria-disabled", "true");
    expect(unavailable).not.toHaveAttribute("title");
    const unavailableDescId = unavailable.getAttribute("aria-describedby");
    expect(unavailableDescId).not.toBeNull();
    expect(document.getElementById(unavailableDescId ?? "")).toHaveTextContent(
      "Research is not available for Spain / Basque. Rank tracking is unaffected.",
    );
    expect(unavailable).toHaveTextContent("unavailable");
    fireEvent.click(unavailable);
    expect(onResearchScopeChange).toHaveBeenCalledTimes(1);
  });

  it("lists the whole catalog without typing and uses the exact no-results message", async () => {
    const user = userEvent.setup();
    renderCard([], vi.fn(), searchableCatalogScopes);

    await user.click(screen.getByRole("button", { name: "Country: United States" }));
    expect(screen.getByRole("menuitem", { name: /France/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Sweden/ })).toBeInTheDocument();

    const search = screen.getByRole("textbox", { name: "Search countries" });
    await user.type(search, "missing");
    expect(screen.getByText("No country matches this search.")).toBeInTheDocument();
  });

  it("separates tracked countries from the rest of the catalog", async () => {
    const user = userEvent.setup();
    renderCard([domainOverviewScopeFixture, germanyScope], vi.fn(), searchableCatalogScopes);

    await user.click(screen.getByRole("button", { name: "Country: United States" }));
    expect(screen.getByText("Tracked countries")).toBeVisible();
    expect(screen.getByText("All countries")).toBeVisible();
    const names = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(names.slice(0, 2)).toEqual(["Germany", "United States"]);
    expect(names.slice(2, 5)).toEqual(["Belgium", "France", "Italy"]);
  });
});
