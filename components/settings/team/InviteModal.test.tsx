import { InviteModal } from "@/components/settings/team/InviteModal";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

function renderInviteModal(inviteMember = vi.fn()) {
  render(
    <InviteModal
      domain="Acme project"
      inviteMember={inviteMember}
      onClose={vi.fn()}
      open
      projectId="project_1"
    />,
  );
  return inviteMember;
}

describe("InviteModal", () => {
  it("focuses the email field when opened", async () => {
    renderInviteModal();

    await waitFor(() => expect(screen.getByLabelText("Email address")).toHaveFocus());
  });

  it("associates invalid-email feedback with the field", async () => {
    renderInviteModal();
    const email = screen.getByLabelText("Email address");

    await userEvent.type(email, "not-an-email");
    await userEvent.tab();

    const error = await screen.findByText("Enter a teammate email.");
    expect(error).toHaveAttribute("id", "invite-email-error");
    expect(email).toHaveAttribute("aria-describedby", "invite-email-error");
    expect(email).toHaveAttribute("aria-invalid", "true");
  });

  it("names the invited address in the success confirmation", async () => {
    const inviteMember = renderInviteModal(
      vi.fn().mockResolvedValue({ inviteLink: "https://app.example.com/invite/token" }),
    );
    const email = screen.getByLabelText("Email address");

    await userEvent.type(email, "new-teammate@example.com");
    await waitFor(() => expect(screen.getByRole("button", { name: "Send invite" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));

    expect(await screen.findByText(/new-teammate@example\.com/)).toBeVisible();
    expect(inviteMember).toHaveBeenCalledWith({
      email: "new-teammate@example.com",
      projectId: "project_1",
      role: "member",
    });
  });

  it("hides the owner-only Admin tier when the manager cannot assign it", () => {
    render(
      <InviteModal
        canAssignAdmin={false}
        domain="Example project"
        inviteMember={vi.fn()}
        onClose={vi.fn()}
        open
        projectId="project_1"
      />,
    );

    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeVisible();
    expect(screen.getByText("Viewer")).toBeVisible();
  });

  it("submits the invite on Cmd+Enter", async () => {
    const inviteMember = renderInviteModal(
      vi.fn().mockResolvedValue({ inviteLink: "https://app.example.com/invite/token" }),
    );
    const email = screen.getByLabelText("Email address");
    await userEvent.type(email, "new-teammate@example.com");
    await waitFor(() => expect(screen.getByRole("button", { name: "Send invite" })).toBeEnabled());
    fireEvent.keyDown(email, { key: "Enter", metaKey: true });
    await waitFor(() =>
      expect(inviteMember).toHaveBeenCalledWith({
        email: "new-teammate@example.com",
        projectId: "project_1",
        role: "member",
      }),
    );
  });

  it("submits the invite on Ctrl+Enter", async () => {
    const inviteMember = renderInviteModal(
      vi.fn().mockResolvedValue({ inviteLink: "https://app.example.com/invite/token" }),
    );
    const email = screen.getByLabelText("Email address");
    await userEvent.type(email, "new-teammate@example.com");
    await waitFor(() => expect(screen.getByRole("button", { name: "Send invite" })).toBeEnabled());
    fireEvent.keyDown(email, { key: "Enter", ctrlKey: true });
    await waitFor(() =>
      expect(inviteMember).toHaveBeenCalledWith({
        email: "new-teammate@example.com",
        projectId: "project_1",
        role: "member",
      }),
    );
  });

  it("does not submit on Cmd+Enter when the email is invalid", async () => {
    const inviteMember = renderInviteModal();
    const email = screen.getByLabelText("Email address");
    await userEvent.type(email, "not-an-email");
    fireEvent.keyDown(email, { key: "Enter", metaKey: true });
    expect(inviteMember).not.toHaveBeenCalled();
  });

  it("closes and resets form state on Escape", async () => {
    const onClose = vi.fn();
    render(
      <InviteModal
        domain="Acme project"
        inviteMember={vi.fn()}
        onClose={onClose}
        open
        projectId="project_1"
      />,
    );
    const email = screen.getByLabelText("Email address");
    await userEvent.type(email, "new-teammate@example.com");
    fireEvent.keyDown(email, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Email address")).toHaveValue("");
  });
});
