import { renderWithSharedMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BusinessArchivePrompt } from "./BusinessArchivePrompt";
import { BusinessIdentityEditor } from "./BusinessIdentityEditor";
import {
  archivedBranch,
  northBranch,
  ownerPermissions,
  projectId,
  businessFixtureTranslate as t,
} from "./test-fixtures";

const callbacks = () => ({
  onSaved: vi.fn(),
  onCancel: vi.fn(),
  onFocusReturn: vi.fn(),
  onRequestCurrent: vi.fn(),
});
describe("identity collision is not a same-version CAS refresh", () => {
  it("retains the draft and requires changed strong identity before another submit", async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce({ kind: "identifier_claimed" })
      .mockResolvedValue({ kind: "error" });
    const props = {
      ...callbacks(),
      projectId,
      location: northBranch,
      current: northBranch,
      permissions: ownerPermissions,
      translate: t,
      save,
    };
    const view = render(<BusinessIdentityEditor {...props} />);
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Branch name"));
    await user.type(screen.getByLabelText("Branch name"), "Draft retained");
    await user.type(screen.getByLabelText("Reason"), "Reviewed branch");
    await user.click(screen.getByRole("button", { name: "Save identity" }));
    await screen.findByText(t("identifierClaimed"));
    expect(screen.getByLabelText("Branch name")).toHaveValue("Draft retained");
    expect(screen.getByRole("button", { name: "Save identity" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Keep my changed fields" }),
    ).not.toBeInTheDocument();
    fireEvent.submit(view.container.querySelector("form")!);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await user.clear(screen.getByLabelText("Google CID (text)"));
    await user.type(screen.getByLabelText("Google CID (text)"), "1234567890");
    await user.click(screen.getByRole("button", { name: "Save identity" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][0].patch.identifiers[0].value).toBe("1234567890");
    expect(save.mock.calls[1][0].idempotencyKey).not.toBe(save.mock.calls[0][0].idempotencyKey);
  });
  it("does not turn restore claim collision into another same-version restore", async () => {
    const save = vi.fn().mockResolvedValue({ kind: "identifier_claimed" });
    const view = render(
      <BusinessArchivePrompt
        {...callbacks()}
        projectId={projectId}
        location={archivedBranch}
        current={archivedBranch}
        nextState="active"
        permissions={ownerPermissions}
        translate={t}
        save={save}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Confirm state change" }));
    await screen.findByText(t("identifierClaimed"));
    expect(
      screen.queryByRole("button", { name: "Use reviewed state version" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm state change" })).toBeDisabled();
    fireEvent.submit(view.container.querySelector("form")!);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });
  it("shows idempotency conflict without offering revision recovery even with refreshed props", async () => {
    const save = vi
      .fn()
      .mockResolvedValue({ kind: "conflict", current: null, reason: "idempotency_conflict" });
    render(
      <BusinessIdentityEditor
        {...callbacks()}
        projectId={projectId}
        location={northBranch}
        current={northBranch}
        permissions={ownerPermissions}
        translate={t}
        save={save}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Branch name"), " changed");
    await user.type(screen.getByLabelText("Reason"), "Reviewed branch");
    await user.click(screen.getByRole("button", { name: "Save identity" }));
    await screen.findByText(t("idempotencyConflict"));
    expect(
      screen.queryByRole("button", { name: "Keep my changed fields" }),
    ).not.toBeInTheDocument();
  });
});
