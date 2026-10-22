import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { appPath } from "@/lib/routing/app-path";
import type { SavedKeywordRow } from "@/lib/saved-keywords/model";
import { fireEvent, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { SavedKeywordsBulkBar } from "./SavedKeywordsTableChrome";

function makeRow(text: string, location = "US"): SavedKeywordRow {
  return {
    countryCode: "US",
    cpc: null,
    difficulty: null,
    intent: null,
    languageCode: "en",
    location,
    publicId: `sk_${text}`,
    savedAt: "2026-01-01T00:00:00.000Z",
    sourceSeed: "other seed",
    text,
    trend: [],
    variantCount: 0,
    volume: null,
  };
}

function renderBar(overrides: Partial<ComponentProps<typeof SavedKeywordsBulkBar>> = {}) {
  const props: ComponentProps<typeof SavedKeywordsBulkBar> = {
    canDelete: true,
    canTrack: true,
    count: 1,
    nativeUsage: null,
    onClear: vi.fn(),
    onRemove: vi.fn(),
    onTrack: vi.fn(),
    projectRef: "prj_1",
    selectedRows: [makeRow("standing desk mat")],
    ...overrides,
  };
  render(<SavedKeywordsBulkBar {...props} />);
  return props;
}

function toolbar() {
  return screen.getByRole("toolbar", { name: "Actions for selected keywords" });
}

describe("SavedKeywordsBulkBar", () => {
  it("shows the count, estimate, and clear control on the shared selection bar", () => {
    const props = renderBar({
      nativeUsage: { providerId: "dataforseo", quantity: 90, unit: "cents", unknownTargets: 0 },
    });

    const bar = toolbar();
    expect(bar).toHaveClass("bg-bg-elev", "border-border");
    expect(bar).not.toHaveClass("bg-accent-soft");
    expect(bar.closest("[data-floating-selection-bar]")).toHaveClass("fixed", "bottom-0");
    expect(within(bar).getByText("1 selected")).toBeInTheDocument();
    expect(
      within(bar).getByText("tracking all 1 adds $0.90/mo at daily checks"),
    ).toBeInTheDocument();
    expect(within(bar).getByText("~$0.90/mo")).toBeInTheDocument();

    fireEvent.click(within(bar).getByRole("button", { name: "Clear" }));
    expect(props.onClear).toHaveBeenCalledTimes(1);
  });

  it("removes and tracks when those permissions are granted", () => {
    const props = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Track 1" }));
    expect(props.onRemove).toHaveBeenCalledTimes(1);
    expect(props.onTrack).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Remove" }).style.getPropertyValue("--control-color"),
    ).toBe("var(--red)");
  });

  it("hides Remove and Track without permission and still offers Research", () => {
    renderBar({ canDelete: false, canTrack: false });
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Track 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Research" })).toBeInTheDocument();
  });

  it("disables Track when a reason is set and hides the estimate summary", () => {
    const props = renderBar({ trackDisabledReason: "Read only" });
    const track = screen.getByRole("button", { name: "Track 1" });
    expect(track).toBeDisabled();
    fireEvent.click(track);
    expect(props.onTrack).not.toHaveBeenCalled();
    expect(screen.queryByText(/unavailable estimate/)).not.toBeInTheDocument();
  });

  it("links Research to the keyword seed and saved location when one keyword is selected", () => {
    renderBar();

    expect(screen.getByRole("link", { name: "Research" })).toHaveAttribute(
      "href",
      `${appPath("prj_1", "keyword-research")}?seed=standing+desk+mat&location=US`,
    );
    expect(screen.queryByRole("link", { name: /other seed/ })).not.toBeInTheDocument();
  });

  it("disables Research with an explanation when several keywords are selected", () => {
    renderBar({
      count: 2,
      selectedRows: [makeRow("alpha"), makeRow("beta", "GB")],
    });
    const research = screen.getByRole("button", { name: "Research" });
    expect(research).toHaveAttribute("aria-disabled", "true");
    expect(research).not.toHaveAttribute("disabled");
    expect(research).not.toHaveAttribute("href");
    expect(screen.queryByRole("link", { name: "Research" })).not.toBeInTheDocument();

    const href = window.location.href;
    fireEvent.click(research);
    expect(window.location.href).toBe(href);
    expect(research).toHaveAccessibleDescription("Research one keyword at a time.");
  });
});
