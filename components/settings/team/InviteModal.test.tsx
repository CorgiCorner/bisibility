import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InviteModal } from "./InviteModal";

function renderInviteModal(inviteMember = vi.fn()) {
  render(
    <InviteModal
      domain="Acme workspace"
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
      vi.fn().mockResolvedValue({ inviteLink: "https://app.example/invite/token" }),
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
});
