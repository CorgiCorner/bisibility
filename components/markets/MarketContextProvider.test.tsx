import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  MarketContextProvider,
  useIsMarketScoped,
  useMarketContext,
} from "./MarketContextProvider";

const PROJECT_REF = `prj_${"a".repeat(24)}`;
const MARKET_REF = `pmkt_${"c".repeat(24)}`;

function Probe() {
  const { market, projectRef } = useMarketContext();
  return (
    <div data-testid="probe">
      {projectRef}:{market?.ref ?? "none"}:{String(useIsMarketScoped())}
    </div>
  );
}

describe("MarketContextProvider", () => {
  it("hands the resolved market to client components with no second fetch", () => {
    render(
      <MarketContextProvider
        market={{ locationId: "location_internal_1", ref: MARKET_REF }}
        projectRef={PROJECT_REF}
      >
        <Probe />
      </MarketContextProvider>,
    );

    expect(screen.getByTestId("probe")).toHaveTextContent(`${PROJECT_REF}:${MARKET_REF}:true`);
  });

  it("reports the project level when no market scopes the page", () => {
    render(
      <MarketContextProvider market={null} projectRef={PROJECT_REF}>
        <Probe />
      </MarketContextProvider>,
    );

    expect(screen.getByTestId("probe")).toHaveTextContent(`${PROJECT_REF}:none:false`);
  });

  it("lets a market provider nest inside the project-level one", () => {
    render(
      <MarketContextProvider market={null} projectRef={PROJECT_REF}>
        <MarketContextProvider
          market={{ locationId: "location_internal_1", ref: MARKET_REF }}
          projectRef={PROJECT_REF}
        >
          <Probe />
        </MarketContextProvider>
      </MarketContextProvider>,
    );

    expect(screen.getByTestId("probe")).toHaveTextContent(`${PROJECT_REF}:${MARKET_REF}:true`);
  });

  it("resolves the context without an effect", () => {
    const source = readFileSync(resolve(import.meta.dirname, "MarketContextProvider.tsx"), "utf8");

    expect(source).not.toContain("useEffect");
  });
});
