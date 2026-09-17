import { permanentRedirect } from "@/tests/next-navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  resolveLastMarketRef: vi.fn(),
  resolveProjectAccess: vi.fn(),
}));

vi.mock("@/lib/markets/market-context", () => ({
  resolveLastMarketRef: mocks.resolveLastMarketRef,
}));
vi.mock("@/lib/queries/_auth", () => ({ resolveProjectAccess: mocks.resolveProjectAccess }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import ResolvedContextPage from "./[...page]/page";

const PROJECT_REF = `prj_${"a".repeat(24)}`;
const PROJECT_ID = "project_internal_1";
const MARKET_REF = `pmkt_${"c".repeat(24)}`;

function cookieStore(values: Record<string, string>) {
  return { get: vi.fn((key: string) => (key in values ? { value: values[key] } : undefined)) };
}

async function resolvePage(
  page: string[],
  searchParams?: Record<string, string | string[] | undefined>,
) {
  return ResolvedContextPage({
    params: Promise.resolve({ page, project: PROJECT_REF }),
    searchParams: searchParams ? Promise.resolve(searchParams) : undefined,
  });
}

describe("resolved context route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permanentRedirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
    mocks.resolveProjectAccess.mockResolvedValue({
      isSample: false,
      mode: "member",
      projectId: PROJECT_ID,
      publicId: PROJECT_REF,
    });
    mocks.cookies.mockResolvedValue(cookieStore({ [`bv_last_market_${PROJECT_REF}`]: MARKET_REF }));
    mocks.resolveLastMarketRef.mockResolvedValue(MARKET_REF);
  });

  it("resolves to the market route when the cookie names an active market of this project", async () => {
    await expect(resolvePage(["rank-tracker"])).rejects.toThrow(
      `NEXT_REDIRECT:/app/${PROJECT_REF}/m/${MARKET_REF}/rank-tracker`,
    );
    expect(mocks.resolveLastMarketRef).toHaveBeenCalledWith(PROJECT_ID, MARKET_REF);
  });

  it("reads the cookie keyed by this project and no other", async () => {
    const store = cookieStore({ [`bv_last_market_${PROJECT_REF}`]: MARKET_REF });
    mocks.cookies.mockResolvedValue(store);

    await expect(resolvePage(["rank-tracker"])).rejects.toThrow("NEXT_REDIRECT:");
    expect(store.get).toHaveBeenCalledWith(`bv_last_market_${PROJECT_REF}`);
  });

  it("drops to the project route when the cookie is absent", async () => {
    mocks.cookies.mockResolvedValue(cookieStore({}));
    mocks.resolveLastMarketRef.mockResolvedValue(null);

    await expect(resolvePage(["rank-tracker"])).rejects.toThrow(
      `NEXT_REDIRECT:/app/${PROJECT_REF}/rank-tracker`,
    );
    expect(mocks.resolveLastMarketRef).toHaveBeenCalledWith(PROJECT_ID, undefined);
  });

  it("drops to the project route for an unknown, archived or other-project value", async () => {
    // Every one of those resolves to null; the route must not care which it was.
    mocks.resolveLastMarketRef.mockResolvedValue(null);

    await expect(resolvePage(["rank-tracker"])).rejects.toThrow(
      `NEXT_REDIRECT:/app/${PROJECT_REF}/rank-tracker`,
    );
  });

  it("drops a page with no market route to the project route rather than to a 404", async () => {
    // With a market remembered, every market-scopable section used to be promoted, and only
    // `rank-tracker` has a route: `~/competitors` resolved to a URL that answers 404.
    await expect(resolvePage(["competitors"])).rejects.toThrow(
      `NEXT_REDIRECT:/app/${PROJECT_REF}/competitors`,
    );
    await expect(resolvePage(["dashboard"])).rejects.toThrow(
      `NEXT_REDIRECT:/app/${PROJECT_REF}/dashboard`,
    );
    await expect(resolvePage(["rank-tracker", "kw_1"])).rejects.toThrow(
      `NEXT_REDIRECT:/app/${PROJECT_REF}/rank-tracker/kw_1`,
    );
  });

  it("drops a project-scoped page to the project route even with an active market remembered", async () => {
    await expect(resolvePage(["settings", "tracking"])).rejects.toThrow(
      `NEXT_REDIRECT:/app/${PROJECT_REF}/settings/tracking`,
    );
    await expect(resolvePage(["alerts"])).rejects.toThrow(
      `NEXT_REDIRECT:/app/${PROJECT_REF}/alerts`,
    );
  });

  it("carries the query through the resolution", async () => {
    await expect(resolvePage(["rank-tracker"], { tab: "saved" })).rejects.toThrow(
      `NEXT_REDIRECT:/app/${PROJECT_REF}/m/${MARKET_REF}/rank-tracker?tab=saved`,
    );
  });
});
