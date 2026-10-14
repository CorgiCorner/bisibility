import {
  northBranch,
  projectId,
  businessFixtureTranslate as t,
  viewerPermissions,
  weakCandidate,
} from "@/components/business-locations/test-fixtures";
import { renderWithSharedMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { BusinessReviewContext } from "@/lib/business-locations/ui-contracts";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BusinessMatchesWorkspace } from "./BusinessMatchesWorkspace";

const actions = vi.hoisted(() => ({
  list: vi.fn(),
  read: vi.fn(),
  rematch: vi.fn(),
  review: vi.fn(),
}));
vi.mock("@/lib/business-location-store/session-actions", () => ({
  listBusinessObservationChoices: actions.list,
  readBusinessReviewCurrent: actions.read,
  rematchBusinessObservations: actions.rematch,
  reviewBusinessMatch: actions.review,
}));
function page(offset: number): BusinessReviewContext {
  return {
    observationRunId: "retained-run-1",
    identityRevisionId: northBranch.identity.revisionId,
    decisions: [{ ...weakCandidate, itemName: offset ? "Later item 257" : "First retained item" }],
    expectedDecisions: [
      { itemId: offset ? "item-257" : weakCandidate.itemId, expectedRevision: 1 },
    ],
    includedCount: offset ? 1 : 256,
    eligibleTotal: 257,
    evidenceAvailable: true,
    watermark: "2026-10-12T12:00:00.000Z",
    cursor: offset ? "second-page" : "first-page",
    nextCursor: offset ? null : "second-page",
    previousCursor: offset ? "first-page" : null,
    offset,
  };
}
describe("owned retained candidate paging controls", () => {
  it("mounts read-only with no calls and explicitly reaches later items with exact bound continuation", async () => {
    actions.list.mockResolvedValue({
      choices: [
        {
          id: "retained-run-1",
          surface: "maps",
          keyword: "Synthetic saved observation",
          recordedAt: "2026-10-12T11:00:00.000Z",
        },
      ],
      next: null,
    });
    actions.read
      .mockResolvedValueOnce(page(0))
      .mockResolvedValueOnce(page(256))
      .mockResolvedValueOnce(page(0));
    render(
      <BusinessMatchesWorkspace
        projectId={projectId}
        location={northBranch}
        permissions={viewerPermissions}
        translate={t}
      />,
    );
    expect(actions.list).not.toHaveBeenCalled();
    expect(actions.read).not.toHaveBeenCalled();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: t("readObservations") }));
    await user.click(await screen.findByRole("button", { name: /Synthetic saved observation/u }));
    await screen.findByRole("button", { name: /First retained item/u });
    await user.click(screen.getByRole("button", { name: t("nextCandidates") }));
    await screen.findByRole("button", { name: /Later item 257/u });
    expect(actions.read.mock.calls[1]).toEqual([
      projectId,
      northBranch.publicId,
      "retained-run-1",
      { cursor: "second-page" },
    ]);
    await user.click(screen.getByRole("button", { name: t("previousCandidates") }));
    await screen.findByRole("button", { name: /First retained item/u });
    expect(actions.read.mock.calls[2]).toEqual([
      projectId,
      northBranch.publicId,
      "retained-run-1",
      { cursor: "first-page" },
    ]);
    expect(actions.rematch).not.toHaveBeenCalled();
    expect(actions.review).not.toHaveBeenCalled();
  });
});
