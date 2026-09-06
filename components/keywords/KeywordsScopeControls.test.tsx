import { FiltersDrawer } from "@/components/keywords/filters/FiltersDrawer";
import { MarketContextProvider } from "@/components/markets/MarketContextProvider";
import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import type { LensLocationOption } from "@/lib/keywords/lens-model";
import type { MarketContextValue } from "@/lib/markets/market-context-value";
import { asMarketRef } from "@/lib/routing/app-path";
import { routerMock } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  KeywordsDeviceScope,
  KeywordsScopeControls,
  KeywordsScopeLocationSelect,
} from "./KeywordsScopeControls";

const locationOptions = [
  { count: 1, displayName: "United States", id: "loc_us", kind: "country" },
] satisfies LensLocationOption[];

function ScopeSurfaces({ market }: Readonly<{ market: MarketContextValue["market"] }>) {
  return (
    <MarketContextProvider market={market} projectRef="prj_1">
      <KeywordsScopeControls
        basePath="/app/prj_1/rank-tracker"
        lens={{ device: "all", locationId: null }}
        locationOptions={locationOptions}
      />
      <FiltersDrawer
        basePath="/app/prj_1/rank-tracker"
        filters={emptyKeywordFilters}
        lens={{ device: "all", locationId: null }}
        locationOptions={locationOptions}
        onChange={() => undefined}
        onClose={() => undefined}
        open
        rows={[]}
      />
    </MarketContextProvider>
  );
}

describe("KeywordsDeviceScope", () => {
  beforeEach(() => routerMock.push.mockClear());

  it("gives inactive device options a visible hover state", () => {
    render(
      <KeywordsDeviceScope
        basePath="/app/prj_1/rank-tracker"
        lens={{ device: "all", locationId: null }}
      />,
    );

    expect(
      screen.getByRole("radio", { name: "All device scope" }).nextElementSibling,
    ).not.toHaveClass("hover:bg-bg-elev");
    expect(
      screen.getByRole("radio", { name: "Desktop device scope" }).nextElementSibling,
    ).toHaveClass("hover:bg-bg-sunken");
    expect(
      screen.getByRole("radio", { name: "Mobile device scope" }).nextElementSibling,
    ).toHaveClass("hover:bg-bg-sunken");
  });

  it("uses the quiet select-sized toolbar treatment", () => {
    render(
      <KeywordsDeviceScope
        basePath="/app/prj_1/rank-tracker"
        lens={{ device: "all", locationId: null }}
      />,
    );

    const selected = screen.getByRole("radio", { name: "All device scope" });
    expect(selected.parentElement?.parentElement).toHaveClass(
      "inline-flex",
      "min-h-[34px]",
      "bg-transparent",
      "text-[12.5px]",
    );
    expect(selected.parentElement).toHaveClass("flex-none");
    expect(selected.nextElementSibling).toHaveClass("bg-bg-sunken", "border-border-control");
    expect(selected.nextElementSibling).toHaveClass("font-normal", "text-fg");
    expect(selected.nextElementSibling?.className).not.toContain("shadow-");
    expect(selected.nextElementSibling).not.toHaveClass("bg-accent");
  });

  it("hides device labels between lg and xl when the location select is visible", () => {
    render(
      <KeywordsDeviceScope
        basePath="/app/prj_1/rank-tracker"
        lens={{ device: "all", locationId: null }}
      />,
    );

    const allLabel = screen.getByRole("radio", { name: "All device scope" }).nextElementSibling;
    expect(allLabel?.querySelector("span")).toHaveClass(
      "hidden",
      "sm:inline",
      "lg:hidden",
      "xl:inline",
    );
  });
});

describe("KeywordsScopeControls", () => {
  it("hides location selectors in a market and leaves them enabled at project level", () => {
    const { rerender } = render(
      <ScopeSurfaces market={{ locationId: "loc_us", ref: asMarketRef("pmkt_us") }} />,
    );

    expect(screen.queryByLabelText("Location scope")).not.toBeInTheDocument();

    rerender(<ScopeSurfaces market={null} />);

    const selectors = screen.getAllByLabelText("Location scope");
    expect(selectors).toHaveLength(2);
    expect(selectors.some((selector) => selector.closest("[class~='lg:hidden']"))).toBe(true);
    selectors.forEach((selector) => {
      expect(selector).toBeEnabled();
    });
  });

  it("wraps location and device controls so they do not overlap on narrow widths", () => {
    const { container } = render(
      <KeywordsScopeControls
        basePath="/app/prj_1/rank-tracker"
        lens={{ device: "all", locationId: null }}
        locationOptions={locationOptions}
      />,
    );

    expect(container.firstElementChild).toHaveClass("flex-wrap", "min-w-0");
  });
});

describe("KeywordsScopeLocationSelect", () => {
  it("uses a viewport-safe content width and keeps location metadata untruncated", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div className="overflow-hidden">
        <KeywordsScopeLocationSelect
          basePath="/app/prj_1/rank-tracker"
          lens={{ device: "all", locationId: null }}
          locationOptions={locationOptions}
        />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Location scope" }));

    const menu = screen.getByRole("menu", { name: "Location scope" });
    const paper = menu.closest<HTMLElement>(".MuiPaper-root");
    expect(paper).toHaveStyle({
      maxWidth: "calc(100vw - 32px)",
      minWidth: "min(280px, calc(100vw - 32px))",
      width: "max-content",
    });
    expect(container).not.toContainElement(paper);
    expect(document.body).toContainElement(paper);
    expect(screen.getByText("United States")).toHaveClass("whitespace-nowrap");
    expect(screen.getByText("1 keyword · country")).toHaveClass("whitespace-nowrap");
  });
});
