import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TargetSwitcher } from "./TargetSwitcher";

const keyword = { ...keywordRows[0], id: "kw_us", device: "desktop" };
const otherLocation = { ...keyword.location, canonicalKey: "DE", countryCode: "DE" };
const targets = [
  keyword,
  { ...keyword, id: "kw_us_mobile", device: "mobile" },
  { ...keyword, id: "kw_de_mobile", device: "mobile", location: otherLocation },
  { ...keyword, id: "kw_de", location: otherLocation },
];
const projectMarkets: ProjectMarketsView = {
  markets: [
    ["pmkt_us", "United States", "US", keyword.location.canonicalKey],
    ["pmkt_de", "Germany", "DE", "DE"],
    ["pmkt_fr", "France", "FR", "FR"],
  ].map(([id, displayName, countryCode, canonicalKey]) => ({
    canonicalKey,
    countryCode,
    displayName,
    id,
    keywordCount: 1,
    languageCode: "en",
    languageLabel: "English",
    monthlyCostCents: 0,
    researchAvailable: true,
    status: id === "pmkt_de" ? "paused" : "active",
  })),
  maxMarkets: 5,
  monthlyCostCents: 0,
  perMarketChecks: 1,
  projectId: "prj_test",
};

function setup(selectedTargets = targets, editable = true) {
  const onAddMarket = vi.fn();
  render(
    <TargetSwitcher
      keyword={keyword}
      onAddMarket={editable ? onAddMarket : undefined}
      projectId="prj_test"
      projectMarkets={projectMarkets}
      targets={selectedTargets}
    />,
  );
  return onAddMarket;
}

describe("keyword market navigation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the standard market menu and retains the device when switching to a paused market", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "United States" }));
    fireEvent.click(await screen.findByRole("option", { name: /Germany/ }));
    expect(routerMock.push).toHaveBeenCalledWith("/app/prj_test/rank-tracker/kw_de");
  });

  it("opens the available device when the same device is not tracked", async () => {
    setup(targets.filter((target) => target.id !== "kw_de"));
    fireEvent.click(screen.getByRole("button", { name: "United States" }));
    fireEvent.click(await screen.findByRole("option", { name: /Germany/ }));
    expect(routerMock.push).toHaveBeenCalledWith("/app/prj_test/rank-tracker/kw_de_mobile");
  });

  it("only offers markets tracking this phrase, without a route back to the list", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "United States" }));
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(screen.queryByRole("option", { name: /France|All markets/ })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: /United States/ }));
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("opens market management on this keyword instead of navigating to the markets page", async () => {
    const onAddMarket = setup();
    fireEvent.click(screen.getByRole("button", { name: "United States" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add market" }));
    expect(onAddMarket).toHaveBeenCalledOnce();
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("allows viewers to switch tracked markets without offering a create action", async () => {
    setup(targets, false);
    fireEvent.click(screen.getByRole("button", { name: "United States" }));
    expect(screen.queryByRole("button", { name: "Add market" })).toBeNull();
    fireEvent.click(await screen.findByRole("option", { name: /Germany/ }));
    expect(routerMock.push).toHaveBeenCalledWith("/app/prj_test/rank-tracker/kw_de");
  });

  it("keeps device switching and market management separate from keyword editing", async () => {
    const onAddMarket = setup();
    fireEvent.click(screen.getByRole("button", { name: "Device scope" }));
    expect((await screen.findAllByRole("menuitem")).map((item) => item.textContent)).toEqual([
      "Desktop",
      "Mobile",
    ]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Mobile" }));
    expect(routerMock.push).toHaveBeenCalledWith("/app/prj_test/rank-tracker/kw_us_mobile");
    expect(onAddMarket).not.toHaveBeenCalled();
  });
});
