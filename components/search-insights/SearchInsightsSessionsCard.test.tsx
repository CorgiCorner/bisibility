import { setNavigationState } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SearchInsightsSessionsCard } from "./SearchInsightsSessionsCard";
import { SESSIONS_CONNECT_BODY, SESSIONS_CONNECT_TITLE } from "./search-insights-copy";

describe("SearchInsightsSessionsCard", () => {
  it("offers the second consent flow with the design copy", () => {
    render(<SearchInsightsSessionsCard projectId="prj_1" />);

    expect(screen.getByText(SESSIONS_CONNECT_TITLE)).toBeInTheDocument();
    expect(screen.getByText(SESSIONS_CONNECT_BODY)).toBeInTheDocument();
    const connect = screen.getByRole("link", { name: "Connect" });
    expect(connect).toHaveAttribute("href", expect.stringContaining("provider=ga4"));
    expect(connect).toHaveClass("MuiButton-outlined");
    expect(connect).toHaveClass("shrink-0");

    const row = connect.parentElement;
    expect(row).toHaveClass("flex", "items-center");
    expect(row?.children).toHaveLength(3);
    expect(row?.children[2]).toBe(connect);
  });
  it.each([
    [
      "archived comparison",
      { property: "sc-domain:bisibility.com", period: "28" },
      "/app/prj_1/search-console?property=sc-domain%3Abisibility.com&period=28",
    ],
    ["period only", { period: "90" }, "/app/prj_1/search-console?period=90"],
    ["clean active view", {}, "/app/prj_1/search-console"],
    [
      "OAuth transients",
      { google: "select", connect: "ga4", provider: "ga4", reason: "x", period: "28" },
      "/app/prj_1/search-console?period=28",
    ],
  ])("preserves the whitelisted %s return view", (_name, searchParams, expected) => {
    setNavigationState({ pathname: "/app/prj_1/search-console", searchParams });
    render(<SearchInsightsSessionsCard projectId="prj_1" />);

    const href = screen.getByRole("link", { name: "Connect" }).getAttribute("href") ?? "";
    expect(new URL(href, "https://example.com").searchParams.get("returnPath")).toBe(expected);
  });
});
