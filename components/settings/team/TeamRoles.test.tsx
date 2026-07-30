import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PendingInvites } from "./TeamPendingInvites";
import { TeamRoles } from "./TeamRoles";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const members = [
  {
    color: "accent" as const,
    email: "member@example.com",
    id: "member_1",
    initials: "ME",
    name: "Member Example",
    role: "Editor" as const,
    roleValue: "member" as const,
  },
];

const pendingInvites = [
  {
    email: "invite@example.com",
    expiresLabel: "expires tomorrow",
    expired: false,
    id: "invite_1",
    invitedByLabel: "Owner Example (owner@example.com)",
    invitedLabel: "invited today",
    role: "Viewer" as const,
    roleValue: "viewer" as const,
  },
];

describe("TeamRoles", () => {
  it("renders membership data without management controls below admin", () => {
    render(
      <TeamRoles
        canManageTeam={false}
        canTransferOwnership={false}
        members={members}
        pendingInvites={pendingInvites}
      />,
    );

    expect(screen.getByText("Member Example")).toBeVisible();
    expect(screen.getByText("invite@example.com")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Invite member" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Change role for Member Example" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Member Example" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Resend invite for invite@example.com" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Revoke invite for invite@example.com" }),
    ).not.toBeInTheDocument();
  });

  it("confirms resend rotation and names the recipient", async () => {
    const resendInvite = vi.fn().mockResolvedValue({ id: "invite_1" });
    render(
      <TeamRoles
        canManageTeam
        members={members}
        pendingInvites={pendingInvites}
        projectId="project_1"
        resendInvite={resendInvite}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Resend invite for invite@example.com" }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "A new invitation was sent to invite@example.com. The previous link no longer works.",
    );
    expect(resendInvite).toHaveBeenCalledWith({
      inviteId: "invite_1",
      projectId: "project_1",
    });
  });

  it("shows resend errors without stale success feedback", async () => {
    const resendInvite = vi
      .fn()
      .mockRejectedValue(new Error("This invitation was sent recently. Try again in 60 seconds."));
    render(
      <TeamRoles
        canManageTeam
        members={members}
        pendingInvites={pendingInvites}
        projectId="project_1"
        resendInvite={resendInvite}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Resend invite for invite@example.com" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Try again in 60 seconds.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows inviter context and recipient-specific controls for expired invites", () => {
    render(
      <TeamRoles
        canManageTeam
        members={members}
        pendingInvites={[
          {
            ...pendingInvites[0],
            expired: true,
            expiresLabel: "expired 2h ago",
          },
        ]}
        projectId="project_1"
        resendInvite={vi.fn()}
        revokeInvite={vi.fn()}
      />,
    );

    expect(screen.getByText("Invited by Owner Example (owner@example.com)")).toBeVisible();
    expect(screen.getByText("invite@example.com").closest("[data-expired]")).toHaveAttribute(
      "data-expired",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Resend invite for invite@example.com" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Revoke invite for invite@example.com" }),
    ).toBeEnabled();
  });

  it("guides managers from the pending-invite empty state", () => {
    render(
      <PendingInvites
        canManageTeam
        invites={[]}
        onResend={vi.fn()}
        onRevoke={vi.fn()}
        pendingAction={null}
      />,
    );

    expect(
      screen.getByText("No pending invites. Use Invite member to add a teammate."),
    ).toBeVisible();
  });
});
