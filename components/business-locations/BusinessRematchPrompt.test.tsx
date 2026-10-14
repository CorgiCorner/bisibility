import { renderWithSharedMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BusinessRematchPrompt } from "./BusinessRematchPrompt";
import {
  ownerPermissions,
  projectId,
  businessFixtureTranslate as t,
  viewerPermissions,
  weakCandidate,
} from "./test-fixtures";

const props = () => ({
  selection: {
    projectId,
    locationId: weakCandidate.locationId,
    identityRevisionId: weakCandidate.identityRevisionId,
    observationRunId: weakCandidate.observationRunId,
    expectedDecisions: [{ itemId: weakCandidate.itemId, expectedRevision: 1 }],
  },
  identityActive: true,
  evidenceAvailable: true,
  permissions: ownerPermissions,
  translate: t,
  rematch: vi.fn().mockResolvedValue({ kind: "error" }),
  onSaved: vi.fn(),
  onCancel: vi.fn(),
  onFocusReturn: vi.fn(),
});
describe("retained-only rematch intent", () => {
  it("sends only the retained exact identity/run/head set after confirmation", async () => {
    const input = props();
    render(<BusinessRematchPrompt {...input} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Rematch retained observation" }));
    await waitFor(() =>
      expect(input.rematch).toHaveBeenCalledWith({
        ...input.selection,
        idempotencyKey: expect.any(String),
      }),
    );
    expect(Object.keys(input.rematch.mock.calls[0][0]).sort()).toEqual([
      "expectedDecisions",
      "idempotencyKey",
      "identityRevisionId",
      "locationId",
      "observationRunId",
      "projectId",
    ]);
  });
  it("blocks missing retained evidence and does not offer a fresh provider request", () => {
    const input = props();
    render(<BusinessRematchPrompt {...input} evidenceAvailable={false} />);
    expect(screen.getByText(t("missingRetainedEvidence"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rematch retained observation" })).toBeDisabled();
    expect(input.rematch).not.toHaveBeenCalled();
  });
  it("rejects duplicate selected heads and changed selection without silently replacing the original intent", () => {
    const input = props();
    const view = render(
      <BusinessRematchPrompt
        {...input}
        selection={{
          ...input.selection,
          expectedDecisions: [
            input.selection.expectedDecisions[0],
            input.selection.expectedDecisions[0],
          ],
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Rematch retained observation" })).toBeDisabled();
    view.rerender(<BusinessRematchPrompt {...input} />);
    expect(screen.getByText(t("conflict"))).toBeInTheDocument();
    expect(input.rematch).not.toHaveBeenCalled();
  });
  it("keeps viewer writes blocked and returns focus on keyboard cancel", async () => {
    const input = props();
    render(<BusinessRematchPrompt {...input} permissions={viewerPermissions} />);
    expect(screen.getByRole("button", { name: "Rematch retained observation" })).toBeDisabled();
    screen.getByRole("button", { name: "Cancel" }).focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(input.onCancel).toHaveBeenCalledOnce();
    expect(input.onFocusReturn).toHaveBeenCalledOnce();
    expect(input.rematch).not.toHaveBeenCalled();
  });
});
