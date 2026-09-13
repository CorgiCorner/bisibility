import { RankTrackerHeaderContext } from "@/components/keywords/RankTrackerHeaderContext";
import { HEADER_CONTEXT_LABEL } from "@/components/shell/HeaderContextSlot";
import { asMarketRef, asProjectRef, marketPath } from "@/lib/routing/app-path";
import { setNavigationState } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listHeaderMarkets: vi.fn(), resolveProjectAccess: vi.fn() }));

vi.mock("@/lib/queries/_auth", () => ({ resolveProjectAccess: mocks.resolveProjectAccess }));
vi.mock("@/lib/queries/header-markets", () => ({ listHeaderMarkets: mocks.listHeaderMarkets }));
vi.mock("@/components/ui/Tooltip", () => import("@/tests/tooltip-stub"));

import NoHeaderContext from "../../../default";
import HeaderContextRoute from "./page";

const PROJECT = asProjectRef("prj_example");
const MARKET = asMarketRef("pmkt_us");

async function renderRoute(page: string[]) {
  setNavigationState({ pathname: marketPath(PROJECT, MARKET, ...page) });
  render(
    await HeaderContextRoute({
      params: Promise.resolve({ market: MARKET, page, project: PROJECT }),
    }),
  );
}

describe("header context slot route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listHeaderMarkets.mockResolvedValue([
      {
        countryCode: "US",
        keywordCount: 12,
        languageCode: "en",
        name: "United States",
        ref: MARKET,
      },
    ]);
    mocks.resolveProjectAccess.mockResolvedValue({
      isSample: false,
      mode: "member",
      projectId: "project_internal_1",
      publicId: PROJECT,
    });
  });

  it("reads the market list and renders the switcher for the market in the URL", async () => {
    await renderRoute(["rank-tracker"]);

    expect(mocks.listHeaderMarkets).toHaveBeenCalledWith(PROJECT);
    expect(screen.getByRole("group", { name: HEADER_CONTEXT_LABEL })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "United States" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Device scope" })).toBeInTheDocument();
  });

  it("registers the device control only for the rank tracker list", async () => {
    const element = await HeaderContextRoute({
      params: Promise.resolve({ market: MARKET, page: ["domain-overview"], project: PROJECT }),
    });
    expect(element?.type).not.toBe(RankTrackerHeaderContext);
  });

  it("covers a deeper market page through the same catch-all", async () => {
    // One slot shadows the whole market subtree, the scope-correcting fallback included, so a
    // new market section never has to remember to bring a switcher with it.
    await renderRoute(["rank-tracker", "kw_1"]);

    expect(screen.getByRole("group", { name: HEADER_CONTEXT_LABEL })).toBeInTheDocument();
  });

  it("reads nothing on a project-scoped route, which matches the default instead", () => {
    // This is the whole point of resolving the slot as a route: `default.tsx` renders nothing,
    // and rendering nothing is what keeps the market read off every page that cannot show it.
    expect(NoHeaderContext()).toBeNull();
    expect(mocks.listHeaderMarkets).not.toHaveBeenCalled();
  });
});
