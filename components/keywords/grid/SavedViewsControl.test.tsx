import { emptySavedViewConfig, type KeywordSavedView } from "@/lib/keywords/saved-view-model";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SavedViewsControl } from "./SavedViewsControl";

const savedViews = [
  {
    canDelete: true,
    config: emptySavedViewConfig,
    createdAt: "2026-07-23T00:00:00.000Z",
    id: "viw_abcdefghijklmnopqrstuvwx",
    name: "Own view",
    surface: "keywords",
  },
  {
    canDelete: false,
    config: emptySavedViewConfig,
    createdAt: "2026-07-23T00:00:00.000Z",
    id: "viw_bbcdefghijklmnopqrstuvwx",
    name: "Other view",
    surface: "keywords",
  },
] satisfies KeywordSavedView[];

describe("SavedViewsControl", () => {
  it("shows delete affordances only for explicitly deletable views", async () => {
    render(
      <SavedViewsControl
        activeFiltersSummary="No filters"
        activeViewId={null}
        config={emptySavedViewConfig}
        deletableSavedViewIds={["viw_abcdefghijklmnopqrstuvwx"]}
        deleteSavedViewAction={vi.fn()}
        projectId="project-1"
        savedViews={savedViews}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "All keywords" }));

    expect(await screen.findByRole("button", { name: "Delete Own view" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete Other view" })).not.toBeInTheDocument();
  });
});
