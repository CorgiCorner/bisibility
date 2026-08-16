import { ToastProvider } from "@/components/ui";
import type { CompetitorSavedViewConfig } from "@/lib/competitors/saved-view-model";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SaveCompetitorViewModal } from "./SaveCompetitorViewModal";

const config = {
  filters: { excludedKeywordIds: [], position: "all", tag: null },
  scope: { device: "desktop", engine: "google", locationId: "location-us" },
  surface: "competitors",
  version: 1,
} satisfies CompetitorSavedViewConfig;

describe("SaveCompetitorViewModal", () => {
  it("renders the save summary sentence without exposing the engine name", () => {
    render(
      <ToastProvider>
        <SaveCompetitorViewModal
          config={config}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          open
          projectId="project-1"
          projectRef="prj_abcdefghijklmnopqrstuvwx"
        />
      </ToastProvider>,
    );

    expect(
      screen.getByText("Saves this location, device, filters, and excluded keywords."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Google engine/)).not.toBeInTheDocument();
  });
});
