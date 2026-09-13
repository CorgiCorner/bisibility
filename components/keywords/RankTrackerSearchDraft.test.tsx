import { RankTrackerDeviceHeaderControl } from "@/components/keywords/RankTrackerDeviceHeaderControl";
import { emptySavedViewConfig } from "@/lib/keywords/saved-view-model";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  RankTrackerSearchDraftProvider,
  useRankTrackerSearchDraft,
} from "./RankTrackerSearchDraft";

function DraftInput() {
  const draft = useRankTrackerSearchDraft();
  return <input aria-label="Draft search" onChange={(event) => draft?.write(event.target.value)} />;
}

function Harness() {
  return (
    <RankTrackerSearchDraftProvider>
      <DraftInput />
      <RankTrackerDeviceHeaderControl />
    </RankTrackerSearchDraftProvider>
  );
}

function selectMobile() {
  fireEvent.click(screen.getByRole("button", { name: "Device scope" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Mobile" }));
}

describe("Rank Tracker header search draft", () => {
  it("uses saved-view device, search and location when the URL does not override them", () => {
    setNavigationState({ pathname: "/app/prj_1/rank-tracker", searchParams: { view: "weekly" } });
    render(
      <RankTrackerDeviceHeaderControl
        savedView={{
          ...emptySavedViewConfig,
          search: "saved",
          lens: { device: "desktop", locationId: "loc_1" },
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Device scope" })).toHaveTextContent("Desktop");
    selectMobile();
    const url = new URL(routerMock.push.mock.calls[0][0], "https://example.com");
    expect(url.searchParams.get("view")).toBe("weekly");
    expect(url.searchParams.get("location")).toBe("loc_1");
    expect(url.searchParams.get("device")).toBe("mobile");
    expect(url.searchParams.get("q")).toBe("saved");
  });
  it("preserves an explicitly cleared draft and the other URL filters", () => {
    setNavigationState({
      pathname: "/app/prj_1/rank-tracker",
      searchParams: { q: "old", tags: "tag_1", page: "3" },
    });
    render(<Harness />);
    fireEvent.change(screen.getByRole("textbox", { name: "Draft search" }), {
      target: { value: "draft" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Draft search" }), {
      target: { value: "" },
    });
    selectMobile();
    const url = new URL(routerMock.push.mock.calls[0][0], "https://example.com");
    expect(url.searchParams.get("q")).toBe("");
    expect(url.searchParams.get("tags")).toBe("tag_1");
    expect(url.searchParams.get("page")).toBe("1");
  });

  it.each([
    ["back/forward URL", "/app/prj_1/rank-tracker"],
    ["another project", "/app/prj_2/rank-tracker"],
    ["another market", "/app/prj_1/m/mkt_2/rank-tracker"],
  ])("does not leak an old draft into %s", (_label, pathname) => {
    setNavigationState({ pathname: "/app/prj_1/rank-tracker", searchParams: { q: "initial" } });
    const { rerender } = render(<Harness />);
    fireEvent.change(screen.getByRole("textbox", { name: "Draft search" }), {
      target: { value: "unsent" },
    });
    setNavigationState({ pathname, searchParams: { q: "navigated" } });
    rerender(<Harness />);
    selectMobile();
    const url = new URL(routerMock.push.mock.calls[0][0], "https://example.com");
    expect(url.pathname).toBe(pathname);
    expect(url.searchParams.get("q")).toBe("navigated");
  });
});
