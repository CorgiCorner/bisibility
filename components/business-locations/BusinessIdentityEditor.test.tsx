import { renderWithSharedMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BusinessIdentityEditorProps } from "./BusinessIdentityEditor";
import { BusinessIdentityEditor } from "./BusinessIdentityEditor";
import {
  northBranch,
  ownerPermissions,
  projectId,
  businessFixtureTranslate as t,
  viewerPermissions,
} from "./test-fixtures";

function props(): BusinessIdentityEditorProps {
  return {
    projectId,
    location: northBranch,
    permissions: ownerPermissions,
    translate: t,
    save: vi.fn().mockResolvedValue({ kind: "error" }),
    onSaved: vi.fn(),
    onCancel: vi.fn(),
    onFocusReturn: vi.fn(),
  };
}
async function fillDraft() {
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("Branch name"));
  await user.type(screen.getByLabelText("Branch name"), "My revised name");
  await user.type(screen.getByLabelText("Reason"), "Reviewed exact branch");
  return user;
}
describe("business identity draft/CAS editor", () => {
  it("preserves draft on error and sends the exact identity revision with no actor or untouched metadata", async () => {
    const input = props();
    render(<BusinessIdentityEditor {...input} />);
    const user = await fillDraft();
    await user.click(screen.getByRole("button", { name: "Save identity" }));
    await screen.findByText(t("saveError"));
    expect(screen.getByLabelText("Branch name")).toHaveValue("My revised name");
    expect(screen.getByLabelText("Google CID (text)")).toHaveValue("18446744073709551615");
    expect(input.save).toHaveBeenCalledWith({
      projectId,
      locationId: northBranch.publicId,
      expectedRevision: 3,
      patch: { name: "My revised name" },
      reason: "Reviewed exact branch",
      idempotencyKey: expect.any(String),
    });
  });
  it("blocks CAS retry until explicit comparison, then refreshes untouched fields and retains changed draft", async () => {
    const input = props();
    const latest = {
      ...northBranch,
      version: 5,
      identity: {
        ...northBranch.identity,
        revision: 4,
        revisionId: "identity-north-v4",
        name: "Server name",
        address: "Latest address",
      },
    };
    input.save = vi
      .fn()
      .mockResolvedValueOnce({ kind: "conflict", current: latest })
      .mockResolvedValue({ kind: "error" });
    render(<BusinessIdentityEditor {...input} />);
    const user = await fillDraft();
    await user.click(screen.getByRole("button", { name: "Save identity" }));
    await screen.findByText(t("conflict"));
    expect(screen.getByRole("button", { name: "Save identity" })).toBeDisabled();
    expect(screen.getByLabelText("Address")).toHaveValue("10 North Street");
    await user.click(screen.getByRole("button", { name: "Keep my changed fields" }));
    expect(screen.getByLabelText("Branch name")).toHaveValue("My revised name");
    expect(screen.getByLabelText("Address")).toHaveValue("Latest address");
    expect(screen.getByLabelText("Branch name")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Save identity" }));
    await waitFor(() => expect(input.save).toHaveBeenCalledTimes(2));
    expect(vi.mocked(input.save).mock.calls[1][0]).toMatchObject({
      expectedRevision: 4,
      patch: { name: "My revised name" },
    });
  });
  it("does not present old props as a fresh read after a generic 409, but accepts an explicit same-version refresh", async () => {
    const input = props();
    input.save = vi.fn().mockResolvedValue({ kind: "conflict", current: null });
    input.onRequestCurrent = vi.fn();
    const view = render(<BusinessIdentityEditor {...input} />);
    const user = await fillDraft();
    await user.click(screen.getByRole("button", { name: "Save identity" }));
    await screen.findByText(t("currentUnavailable"));
    expect(
      screen.queryByRole("button", { name: "Keep my changed fields" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review current data" }));
    expect(input.onRequestCurrent).toHaveBeenCalledOnce();
    view.rerender(<BusinessIdentityEditor {...input} current={northBranch} />);
    await user.click(screen.getByRole("button", { name: "Keep my changed fields" }));
    expect(screen.getByRole("button", { name: "Save identity" })).toBeEnabled();
    expect(screen.getByLabelText("Branch name")).toHaveValue("My revised name");
  });
  it("never invokes a mutation for viewers, including a synthetic form submit", async () => {
    const input = { ...props(), permissions: viewerPermissions };
    const view = render(<BusinessIdentityEditor {...input} />);
    expect(screen.getByLabelText("Branch name")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save identity" })).toBeDisabled();
    fireEvent.submit(view.container.querySelector("form")!);
    await waitFor(() => expect(input.save).not.toHaveBeenCalled());
  });
  it("returns focus through the host callback on keyboard cancel and restores the previous draft", async () => {
    const input = props();
    render(<BusinessIdentityEditor {...input} />);
    const user = await fillDraft();
    screen.getByRole("button", { name: "Cancel" }).focus();
    await user.keyboard("{Enter}");
    expect(input.onCancel).toHaveBeenCalledOnce();
    expect(input.onFocusReturn).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Branch name")).toHaveValue(northBranch.identity.name);
  });
  it("requires reopening when a different public location is selected", () => {
    const input = props();
    const view = render(<BusinessIdentityEditor {...input} />);
    view.rerender(
      <BusinessIdentityEditor
        {...input}
        location={{ ...northBranch, publicId: `biz_${"z".repeat(24)}` }}
      />,
    );
    expect(screen.getByText(t("selectionChanged"))).toBeInTheDocument();
    expect(screen.queryByLabelText("Branch name")).not.toBeInTheDocument();
  });
});
