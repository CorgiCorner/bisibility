import { renderWithSharedMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BusinessCandidateReview } from "./BusinessCandidateReview";
import {
  ownerPermissions,
  projectId,
  businessFixtureTranslate as t,
  viewerPermissions,
  weakCandidate,
} from "./test-fixtures";

const props = () => ({
  projectId,
  decision: weakCandidate,
  identityActive: true,
  permissions: ownerPermissions,
  translate: t,
  formatDate: (iso: string) => iso,
  review: vi.fn().mockResolvedValue({ kind: "error" }),
  onSaved: vi.fn(),
  onCancel: vi.fn(),
  onFocusReturn: vi.fn(),
});
describe("retained per-item candidate review", () => {
  it("requires explicit review, preserves original Maps slot/page and unknown promotion, and submits only exact refs", async () => {
    const input = props();
    render(<BusinessCandidateReview {...input} />);
    const user = userEvent.setup();
    expect(screen.getByText("Google Maps")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Reason"), "Reviewed address and branch");
    await user.click(screen.getByRole("button", { name: "Save item review" }));
    expect(await screen.findByText(t("validation.confirmed"))).toBeInTheDocument();
    expect(input.review).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Save item review" }));
    await waitFor(() =>
      expect(input.review).toHaveBeenCalledWith({
        projectId,
        locationId: weakCandidate.locationId,
        identityRevisionId: weakCandidate.identityRevisionId,
        observationRunId: weakCandidate.observationRunId,
        itemId: weakCandidate.itemId,
        decisionId: weakCandidate.decisionId,
        expectedDecisionRevision: 1,
        action: "confirm",
        reason: "Reviewed address and branch",
        idempotencyKey: expect.any(String),
      }),
    );
  });
  it("keeps hard identity conflicts first-class and disables confirm while allowing explicit rejection", async () => {
    const input = props();
    render(
      <BusinessCandidateReview
        {...input}
        decision={{
          ...weakCandidate,
          surface: "local_finder",
          status: "unresolved",
          reason: "stable_identifier_conflict",
          matchedBy: null,
        }}
      />,
    );
    expect(screen.getByText("Google Local Finder")).toBeInTheDocument();
    expect(screen.getByText("Conflicting stable identifier")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Review action" }));
    expect(await screen.findByRole("menuitem", { name: "Confirm this candidate" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(input.review).not.toHaveBeenCalled();
  });
  it("never resumes the same stored candidate after 409; requires refresh/rematch with a newer decision", async () => {
    const input = props();
    input.review.mockResolvedValue({ kind: "conflict", current: weakCandidate });
    render(<BusinessCandidateReview {...input} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Reason"), "My review reason");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Save item review" }));
    await screen.findByText(t("conflict"));
    expect(screen.getByRole("button", { name: "Save item review" })).toBeDisabled();
    expect(screen.getByLabelText("Reason")).toHaveValue("My review reason");
    expect(
      screen.queryByRole("button", { name: "Review latest decision" }),
    ).not.toBeInTheDocument();
  });
  it("blocks missing display evidence, inactive identities and viewer writes", () => {
    const input = props();
    const view = render(
      <BusinessCandidateReview
        {...input}
        decision={{ ...weakCandidate, itemName: null, itemDomain: null }}
      />,
    );
    expect(screen.getByRole("button", { name: "Save item review" })).toBeDisabled();
    view.rerender(<BusinessCandidateReview {...input} identityActive={false} />);
    expect(screen.getByRole("button", { name: "Save item review" })).toBeDisabled();
    view.rerender(<BusinessCandidateReview {...input} permissions={viewerPermissions} />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(input.review).not.toHaveBeenCalled();
  });
});
