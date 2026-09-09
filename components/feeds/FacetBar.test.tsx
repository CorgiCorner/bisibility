import type { FeedFacetOptions } from "@/lib/feeds/facets";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { FacetBar } from "./FacetBar";

const options = {
  engine: [{ label: "Google", value: "google" }],
  market: [{ label: "Malaga core", value: "pmkt_malaga" }],
  severity: [{ label: "Urgent", value: "urgent" }],
} satisfies FeedFacetOptions;

describe("FacetBar", () => {
  beforeEach(() => {
    setNavigationState({
      pathname: "/app/prj_example/alerts",
      searchParams: { f: "market:pmkt_malaga", page: "2", q: "release" },
    });
  });

  it("removes a token with a canonical URL while keeping unrelated query state", async () => {
    const user = userEvent.setup();
    render(<FacetBar facets={[{ axis: "market", value: "pmkt_malaga" }]} options={options} />);

    await user.click(screen.getByRole("button", { name: "Remove market: Malaga core" }));

    expect(routerMock.push).toHaveBeenCalledWith("/app/prj_example/alerts?q=release");
    expect(document.querySelector("select")).toBeNull();
  });

  it("offers only remaining valid values through an accessible menu", async () => {
    const user = userEvent.setup();
    render(<FacetBar facets={[{ axis: "market", value: "pmkt_malaga" }]} options={options} />);

    await user.click(screen.getByRole("button", { name: "Add filter" }));

    expect(screen.getByRole("menu", { name: "Add feed filter" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Engine: Google" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Severity: Urgent" })).toBeVisible();
    expect(screen.queryByRole("menuitem", { name: "Market: Malaga core" })).toBeNull();
  });
});
