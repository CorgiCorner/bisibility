import { renderWithSearchInsightsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { setNavigationState } from "@/tests/next-navigation";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ga4ConnectDismissalKey, SearchInsightsSessionsCard } from "./SearchInsightsSessionsCard";
import { SESSIONS_CONNECT_BODY, SESSIONS_CONNECT_TITLE } from "./search-insights-copy";

describe("SearchInsightsSessionsCard", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("offers the second consent flow with the design copy", () => {
    render(<SearchInsightsSessionsCard projectId="prj_1" />);

    expect(screen.getByText(SESSIONS_CONNECT_TITLE)).toBeInTheDocument();
    expect(screen.getByText(SESSIONS_CONNECT_BODY)).toBeInTheDocument();
    const connect = screen.getByRole("link", { name: "Connect" });
    expect(connect).toHaveAttribute("href", expect.stringContaining("provider=ga4"));
    expect(connect).toHaveAttribute("data-variant", "secondary");
    expect(connect).toHaveClass("shrink-0");

    const row = connect.parentElement;
    expect(row).toHaveClass("flex", "items-center");
    expect(row?.children).toHaveLength(4);
    expect(row?.children[2]).toBe(connect);
    expect(row?.children[3]).toBe(
      screen.getByRole("button", { name: "Dismiss organic sessions prompt" }),
    );
  });

  it("dismisses the prompt for this project only", () => {
    const view = render(<SearchInsightsSessionsCard projectId="prj_1" />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss organic sessions prompt" }));

    expect(screen.queryByText(SESSIONS_CONNECT_TITLE)).not.toBeInTheDocument();
    expect(view.container.querySelector(".border-dashed")).not.toBeInTheDocument();
    expect(localStorage.getItem(ga4ConnectDismissalKey("prj_1"))).toBe("dismissed");
    expect(localStorage.getItem(ga4ConnectDismissalKey("prj_2"))).toBeNull();
    view.unmount();

    const otherProject = render(<SearchInsightsSessionsCard projectId="prj_2" />);
    expect(screen.getByText(SESSIONS_CONNECT_TITLE)).toBeInTheDocument();
    otherProject.unmount();

    render(<SearchInsightsSessionsCard projectId="prj_1" />);
    expect(screen.queryByText(SESSIONS_CONNECT_TITLE)).not.toBeInTheDocument();
  });

  it("stays on screen when storage throws and still dismisses for this visit", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<SearchInsightsSessionsCard projectId="prj_1" />);

    expect(screen.getByText(SESSIONS_CONNECT_TITLE)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss organic sessions prompt" }));
    expect(screen.queryByText(SESSIONS_CONNECT_TITLE)).not.toBeInTheDocument();
    expect(screen.queryByText(SESSIONS_CONNECT_BODY)).not.toBeInTheDocument();
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
