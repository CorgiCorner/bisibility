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
import { KeywordsScopeControls, KeywordsScopeLocationSelect } from "./KeywordsScopeControls";

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

describe("KeywordsScopeControls", () => {
  beforeEach(() => routerMock.push.mockClear());

  it("leaves device selection to the contextual header", () => {
    render(
      <KeywordsScopeControls
        basePath="/app/prj_1/rank-tracker"
        lens={{ device: "all", locationId: null }}
        locationOptions={locationOptions}
      />,
    );

    expect(screen.queryAllByRole("radio", { name: /device scope/ })).toHaveLength(0);
  });

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
  it("uses a viewport-safe content width and preserves accessible location metadata", async () => {
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
    const paper = menu.closest<HTMLElement>("[data-ui-overlay]");
    expect(paper).toHaveStyle({
      maxWidth: "calc(100vw - 32px)",
      minWidth: "min(280px, calc(100vw - 32px))",
      width: "max-content",
    });
    expect(container).not.toContainElement(paper);
    expect(document.body).toContainElement(paper);
    expect(
      screen.getByRole("menuitem", { name: /^United States\s*1 keyword · country$/ }),
    ).toBeVisible();
    expect(screen.getByText("United States")).toHaveAttribute("title", "United States");
  });
});
