import {
  renderWithResearchMessages,
  sharedMessagesElement,
} from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import type { ResearchSaveDraft } from "./research-workspace-model";
import { useResearchSavedKeywords } from "./useResearchSavedKeywords";

const mocks = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("@/components/ui/toast-context", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));
const save = vi.fn(async () => ({ created: [], duplicateCount: 0, savedCount: 1 }));
function Harness() {
  const { save: act } = useResearchSavedKeywords({
    canRemove: false,
    markSaved: vi.fn(),
    projectId: "prj_example",
    saveKeywordsAction: save as never,
    removeSavedKeywordsAction: vi.fn() as never,
  });
  return (
    <button
      type="button"
      onClick={() =>
        void act({
          location: "US",
          sourceSeed: "rank tracker",
          rows: [{ keyword: "rank tracker", variants: [{ keyword: "rank tracker" }] }],
        } as ResearchSaveDraft)
      }
    >
      Save fixture
    </button>
  );
}
it("resolves toast labels before the toast leaves its feature messages boundary", async () => {
  renderWithResearchMessages(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Save fixture" }));
  await waitFor(() => expect(mocks.showToast).toHaveBeenCalled());
  const message = mocks.showToast.mock.calls[0]?.[0] as ReactNode;
  const view = render(sharedMessagesElement(message));
  expect(view.container).toHaveTextContent("Saved 1 keyword");
  expect(screen.getByRole("link", { name: "View in Keywords / Saved" })).toHaveAttribute(
    "href",
    expect.stringContaining("saved"),
  );
  expect(view.container).not.toHaveTextContent("projectResearch.");
});
