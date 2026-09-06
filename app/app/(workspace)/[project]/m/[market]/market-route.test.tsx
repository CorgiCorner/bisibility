import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useMarketContext } from "@/components/markets/MarketContextProvider";
import { notFound, permanentRedirect } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cookies: vi.fn(), requireMarketContext: vi.fn() }));

vi.mock("@/lib/markets/market-context", () => ({
  requireMarketContext: mocks.requireMarketContext,
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import MarketScopeFallbackPage from "./[...page]/page";
import MarketLayout from "./layout";

const PROJECT_REF = `prj_${"a".repeat(24)}`;
const MARKET_REF = `pmkt_${"c".repeat(24)}`;

function Probe() {
  const { market, projectRef } = useMarketContext();
  return (
    <div data-testid="probe">
      {projectRef}:{market?.ref ?? "none"}:{market?.locationId ?? "none"}
    </div>
  );
}

async function renderLayout() {
  render(
    await MarketLayout({
      children: <Probe />,
      params: Promise.resolve({ market: MARKET_REF, project: PROJECT_REF }),
    }),
  );
}

describe("market layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    permanentRedirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
    mocks.requireMarketContext.mockResolvedValue({
      market: { locationId: "location_internal_1", ref: MARKET_REF },
      projectId: "project_internal_1",
      projectRef: PROJECT_REF,
    });
  });

  it("hands client components the context the server resolved from the segment", async () => {
    await renderLayout();

    expect(screen.getByTestId("probe")).toHaveTextContent(
      `${PROJECT_REF}:${MARKET_REF}:location_internal_1`,
    );
    expect(mocks.requireMarketContext).toHaveBeenCalledWith(PROJECT_REF, MARKET_REF);
  });

  it("renders the same URL identically whatever a last-market cookie says", async () => {
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => ({ value: `pmkt_${"d".repeat(24)}` })),
    });
    await renderLayout();
    const withCookie = screen.getByTestId("probe").textContent;

    mocks.cookies.mockResolvedValue({ get: vi.fn(() => undefined) });
    await renderLayout();
    const rendered = screen.getAllByTestId("probe");

    expect(withCookie).toBe(rendered.at(-1)?.textContent);
    // The strong form: the render never asked for a cookie at all.
    expect(mocks.cookies).not.toHaveBeenCalled();
  });

  it("reads no cookie at all, which is what makes a shared link show the same page", () => {
    const layoutSource = readFileSync(resolve(import.meta.dirname, "layout.tsx"), "utf8");
    const readerSource = readFileSync(
      resolve(process.cwd(), "lib/markets/market-context.ts"),
      "utf8",
    );

    expect(layoutSource).not.toContain("next/headers");
    expect(layoutSource).not.toContain("cookies(");
    expect(readerSource).not.toContain("next/headers");
    expect(readerSource).not.toContain("cookies(");
  });
});

describe("market scope fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    permanentRedirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
    mocks.requireMarketContext.mockResolvedValue({
      market: { locationId: "location_internal_1", ref: MARKET_REF },
      projectId: "project_internal_1",
      projectRef: PROJECT_REF,
    });
  });

  async function renderFallback(
    page: string[],
    searchParams?: Record<string, string | string[] | undefined>,
  ) {
    return MarketScopeFallbackPage({
      params: Promise.resolve({ market: MARKET_REF, page, project: PROJECT_REF }),
      searchParams: searchParams ? Promise.resolve(searchParams) : undefined,
    });
  }

  it("moves a project-scoped page from the wrong scope to the right one", async () => {
    await expect(renderFallback(["settings", "tracking"])).rejects.toThrow(
      `NEXT_REDIRECT:/app/${PROJECT_REF}/settings/tracking`,
    );
  });

  it("moves a feed out of the market segment", async () => {
    await expect(renderFallback(["alerts"])).rejects.toThrow(
      `NEXT_REDIRECT:/app/${PROJECT_REF}/alerts`,
    );
  });

  it("sends a market-scopable page with no market route to the project level, not to a 404", async () => {
    // The page exists one segment away. Answering 404 here would hide it, which is the same
    // break `~` used to produce for `competitors` whenever a last-market cookie was set.
    await expect(renderFallback(["competitors"])).rejects.toThrow(
      `NEXT_REDIRECT:/app/${PROJECT_REF}/competitors`,
    );
    await expect(renderFallback(["rank-tracker", "kw_1"])).rejects.toThrow(
      `NEXT_REDIRECT:/app/${PROJECT_REF}/rank-tracker/kw_1`,
    );
    expect(notFound).not.toHaveBeenCalled();
  });

  it("carries the query onto the corrected URL", async () => {
    // The real caller, not the helper: the correction accepted a search argument that the page
    // never passed, so the tab, filter or anchor the reader followed was dropped by the 308.
    await expect(renderFallback(["settings"], { tab: "audit" })).rejects.toThrow(
      `NEXT_REDIRECT:/app/${PROJECT_REF}/settings?tab=audit`,
    );
    await expect(renderFallback(["competitors"], { sort: "gap", view: "table" })).rejects.toThrow(
      `NEXT_REDIRECT:/app/${PROJECT_REF}/competitors?sort=gap&view=table`,
    );
  });

  it("validates the market before correcting the scope, so a bad id never leaks a redirect", async () => {
    mocks.requireMarketContext.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(renderFallback(["settings"])).rejects.toThrow("NEXT_NOT_FOUND");
    expect(permanentRedirect).not.toHaveBeenCalled();
  });
});
