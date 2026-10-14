import { renderWithSharedMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BusinessSubjectAssignment } from "./BusinessSubjectAssignment";
import {
  archivedBranch,
  competitorBranch,
  northBranch,
  ownerPermissions,
  projectId,
  southBranch,
  businessFixtureTranslate as t,
  unassigned,
  viewerPermissions,
} from "./test-fixtures";

const props = () => ({
  projectId,
  assignment: unassigned,
  locations: [northBranch, southBranch, archivedBranch, competitorBranch],
  permissions: ownerPermissions,
  translate: t,
  save: vi.fn(),
  onSaved: vi.fn(),
});
describe("explicit local subject assignment", () => {
  it("does not choose a branch automatically, excludes archived/competitor branches, and captures the selected exact revision", async () => {
    const input = props();
    input.save.mockResolvedValue({ kind: "error" });
    render(<BusinessSubjectAssignment {...input} />);
    expect(screen.getByRole("button", { name: "Save subject assignment" })).toBeDisabled();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Subject branch" }));
    expect(screen.queryByRole("menuitem", { name: /Other Coffee/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Archived branch/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("menuitem", { name: /Example Coffee South/ }));
    await user.type(screen.getByLabelText("Reason"), "Selected south branch explicitly");
    await user.click(screen.getByRole("button", { name: "Save subject assignment" }));
    await waitFor(() =>
      expect(input.save).toHaveBeenCalledWith({
        projectId,
        scope: unassigned.scope,
        expectedRevision: 0,
        target: {
          locationId: southBranch.publicId,
          identityRevisionId: southBranch.identity.revisionId,
        },
        reason: "Selected south branch explicitly",
        idempotencyKey: expect.any(String),
      }),
    );
  });
  it("retains choice/reason across assignment CAS conflict and requires explicit current-head review", async () => {
    const input = props();
    const current = {
      ...unassigned,
      revision: 2,
      target: {
        locationId: northBranch.publicId,
        identityRevisionId: northBranch.identity.revisionId,
      },
    };
    input.save
      .mockResolvedValueOnce({ kind: "conflict", current })
      .mockResolvedValue({ kind: "error" });
    render(<BusinessSubjectAssignment {...input} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Subject branch" }));
    await user.click(await screen.findByRole("menuitem", { name: /Example Coffee South/ }));
    await user.type(screen.getByLabelText("Reason"), "Keep my deliberate choice");
    await user.click(screen.getByRole("button", { name: "Save subject assignment" }));
    await screen.findByText(t("conflict"));
    expect(screen.getByRole("button", { name: "Save subject assignment" })).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Use reviewed assignment revision and keep my choice" }),
    );
    expect(screen.getByLabelText("Reason")).toHaveValue("Keep my deliberate choice");
    await user.click(screen.getByRole("button", { name: "Save subject assignment" }));
    await waitFor(() => expect(input.save).toHaveBeenCalledTimes(2));
    expect(input.save.mock.calls[1][0]).toMatchObject({
      expectedRevision: 2,
      target: {
        locationId: southBranch.publicId,
        identityRevisionId: southBranch.identity.revisionId,
      },
    });
  });
  it("does not silently upgrade a stale saved identity to the same branch's new identity", () => {
    const input = props();
    const assignment = {
      ...unassigned,
      revision: 3,
      targetAvailable: false,
      target: { locationId: northBranch.publicId, identityRevisionId: "old-identity" },
    };
    render(<BusinessSubjectAssignment {...input} assignment={assignment} />);
    expect(screen.getAllByText(t("staleAssignment")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Save subject assignment" })).toBeDisabled();
    expect(input.save).not.toHaveBeenCalled();
  });
  it("disables viewer mutation controls", () => {
    const input = props();
    render(<BusinessSubjectAssignment {...input} permissions={viewerPermissions} />);
    expect(screen.getByRole("button", { name: "Subject branch" })).toBeDisabled();
    expect(screen.getByLabelText("Reason")).toBeDisabled();
    expect(input.save).not.toHaveBeenCalled();
  });
});
