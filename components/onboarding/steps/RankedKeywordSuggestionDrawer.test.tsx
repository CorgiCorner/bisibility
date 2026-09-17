import { renderWithOnboardingMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, within } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { rankedImportMessages } from "./keyword-import-messages";
import type { RankedKeywordGroup } from "./keyword-ranked-model";
import { RankedKeywordSuggestionDrawer } from "./RankedKeywordSuggestionDrawer";

const groups: RankedKeywordGroup[] = [
  {
    alreadyTracked: false,
    count: 1,
    key: "alpha",
    row: {
      alreadyTracked: false,
      estimatedTraffic: 30,
      keyword: "Alpha",
      position: 3,
      searchVolume: 1_200,
    },
  },
  {
    alreadyTracked: false,
    count: 2,
    key: "beta",
    row: {
      alreadyTracked: false,
      estimatedTraffic: 20,
      keyword: "Beta",
      position: 7,
      searchVolume: 800,
    },
  },
  {
    alreadyTracked: false,
    count: 1,
    key: "gamma",
    row: {
      alreadyTracked: false,
      estimatedTraffic: 10,
      keyword: "Gamma",
      position: null,
      searchVolume: null,
    },
  },
  {
    alreadyTracked: true,
    count: 1,
    key: "tracked",
    row: {
      alreadyTracked: true,
      estimatedTraffic: 40,
      keyword: "Tracked",
      position: 1,
      searchVolume: 9_000,
    },
  },
];

type DrawerProps = Parameters<typeof RankedKeywordSuggestionDrawer>[0];

function LocalizedRankedKeywordSuggestionDrawer(props: Omit<DrawerProps, "messages">) {
  const t = useTranslations("onboarding.keywords");
  return <RankedKeywordSuggestionDrawer {...props} messages={rankedImportMessages(t).drawer} />;
}

function renderDrawer(overrides: Partial<Omit<DrawerProps, "messages">> = {}) {
  const onConfirm = vi.fn();
  render(
    <LocalizedRankedKeywordSuggestionDrawer
      canLoad
      currentKeywords={[]}
      groups={groups}
      lastPageCached={false}
      onClose={vi.fn()}
      onConfirm={onConfirm}
      onLoadMore={vi.fn()}
      open
      pageCostCents={2}
      pageCount={1}
      pending={false}
      remaining={2}
      spentCents={2}
      {...overrides}
    />,
  );
  return { onConfirm };
}

describe("RankedKeywordSuggestionDrawer", () => {
  it("uses the auto DataTable while retaining full headers and tracked-row controls", () => {
    renderDrawer();

    const table = screen.getByRole("table", { name: "Ranked keyword suggestions" });
    expect(table).toHaveAttribute("data-layout", "auto");
    expect(table).toHaveAttribute("data-testid", "ranked-keyword-suggestions");
    expect(within(table).getByText("Keyword", { exact: true })).toBeInTheDocument();
    expect(within(table).getByText("Position", { exact: true })).toBeInTheDocument();
    expect(within(table).getByText("Volume", { exact: true })).toBeInTheDocument();
    expect(within(table).getByText("Est. traffic", { exact: true })).toBeInTheDocument();
    expect(table.style.getPropertyValue("--dt-col-position")).toBe("96px");
    expect(table.style.getPropertyValue("--dt-col-volume")).toBe("88px");
    expect(table.style.getPropertyValue("--dt-col-estimatedTraffic")).toBe("116px");
    expect(screen.getByRole("checkbox", { name: "Select Tracked" })).toBeDisabled();
  });

  it("keeps the capacity limit while allowing a replacement selection", () => {
    const { onConfirm } = renderDrawer();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Gamma" }));
    expect(screen.getByRole("button", { name: "Add 2 keywords" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Gamma" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 2 keywords" }));

    expect(onConfirm).toHaveBeenCalledWith(["Beta", "Gamma"]);
  });
});
