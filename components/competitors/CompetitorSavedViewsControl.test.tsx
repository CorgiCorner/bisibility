import type { CompetitorSavedViewConfig } from "@/lib/competitors/saved-view-model";
import type { CompetitorSavedView } from "@/lib/saved-views/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompetitorSavedViewsControl } from "./CompetitorSavedViewsControl";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const config = {
  filters: { excludedKeywordIds: [], position: "all", tag: null },
  scope: { device: "desktop", engine: "google", locationId: "location-us" },
  surface: "competitors",
  version: 1,
} satisfies CompetitorSavedViewConfig;

const savedViews = [
  {
    canDelete: true,
    config,
    createdAt: "2026-07-23T00:00:00.000Z",
    id: "viw_abcdefghijklmnopqrstuvwx",
    name: "Own view",
    surface: "competitors",
  },
  {
    canDelete: false,
    config,
    createdAt: "2026-07-23T00:00:00.000Z",
    id: "viw_bbcdefghijklmnopqrstuvwx",
    name: "Other view",
    surface: "competitors",
  },
] satisfies CompetitorSavedView[];

describe("CompetitorSavedViewsControl", () => {
  it("shows delete affordances only for explicitly deletable views", async () => {
    render(
      <CompetitorSavedViewsControl
        activeViewId={null}
        config={config}
        deletableSavedViewIds={["viw_abcdefghijklmnopqrstuvwx"]}
        deleteSavedViewAction={vi.fn()}
        modified={false}
        onDiscard={vi.fn()}
        onSaved={vi.fn()}
        projectId="project-1"
        projectRef="prj_abcdefghijklmnopqrstuvwx"
        savedViews={savedViews}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Comparison views" }));

    expect(await screen.findByRole("button", { name: "Delete Own view" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete Other view" })).not.toBeInTheDocument();
  });
});
