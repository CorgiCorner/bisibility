import {
  TeamMembersCard,
  type TeamMembersCardProps,
} from "@/components/settings/team/TeamMembersCard";
import type { TeamMemberData } from "@/lib/queries/team";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const owner: TeamMemberData = {
  accessLabel: "Project access since 4 Feb 2025",
  avatarUrl: null,
  canChangeRole: false,
  canRemove: false,
  canTransferOwnership: false,
  color: "accent",
  email: "owner@example.com",
  hasAuditAccess: false,
  id: "mbr_owner",
  initials: "OE",
  isCurrentUser: true,
  name: "Owner Example",
  role: "Owner",
  roleValue: "owner",
};

const auditor: TeamMemberData = {
  accessLabel: "Project access since 15 Jan 2026",
  avatarUrl: null,
  canChangeRole: true,
  canRemove: true,
  canTransferOwnership: true,
  color: "blue",
  email: "auditor@example.com",
  hasAuditAccess: true,
  id: "mbr_auditor",
  initials: "AE",
  isCurrentUser: false,
  name: "Audit Example",
  role: "Viewer",
  roleValue: "viewer",
};

const editor: TeamMemberData = {
  ...auditor,
  email: "editor@example.com",
  hasAuditAccess: false,
  id: "mbr_editor",
  initials: "EE",
  name: "Editor Example",
  role: "Editor",
  roleValue: "member",
};

function renderCard(overrides: Partial<TeamMembersCardProps> = {}) {
  const props: TeamMembersCardProps = {
    canAssignAdmin: true,
    canManageTeam: true,
    changeMemberRole: vi.fn().mockResolvedValue({}),
    domain: "example.com",
    inviteMember: vi.fn().mockResolvedValue({ inviteLink: "https://example.com/invite/test" }),
    members: [owner, auditor],
    projectId: "prj_test",
    removeMember: vi.fn().mockResolvedValue({}),
    transferOwnership: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
  render(<TeamMembersCard {...props} />);
  return props;
}

describe("TeamMembersCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a member's server-derived avatar URL", () => {
    renderCard({
      members: [{ ...owner, avatarUrl: "https://example.com/avatar.png" }],
    });

    expect(document.querySelector('img[src="https://example.com/avatar.png"]')).not.toBeNull();
  });

  it("shows an existing auditor as Viewer with audit access", () => {
    renderCard();

    expect(screen.getByText("Viewer / audit")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actions for Audit Example" })).toBeVisible();
  });

  it("keeps member actions in one ellipsis menu instead of visible row controls", async () => {
    renderCard({ members: [owner, editor, auditor] });

    expect(screen.queryByRole("button", { name: /Change role/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Transfer ownership/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove / })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Actions for / })).toHaveLength(2);
    expect(screen.getByText("Viewer / audit")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Actions for Editor Example" }));
    const editorMenu = await screen.findByRole("menu", { name: "Actions for Editor Example" });
    expect(within(editorMenu).getByText("Change role")).toBeVisible();
    expect(within(editorMenu).getByText("Transfer ownership")).toBeVisible();
    expect(within(editorMenu).getByText("Remove from project")).toBeVisible();
    fireEvent.keyDown(editorMenu, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("menu", { name: "Actions for Editor Example" }),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Actions for Audit Example" }));
    const menu = await screen.findByRole("menu", { name: "Actions for Audit Example" });
    expect(within(menu).getByText("Change role")).toBeVisible();
    expect(
      within(menu).getByText(
        /managed audit role.*cannot be represented as a normal assignable role/i,
      ),
    ).toBeVisible();
  });

  it("changes a member role from its row without staging a card Save", async () => {
    const props = renderCard({ members: [owner, editor] });

    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    const footer = document.querySelector("[data-team-members-footer]");
    expect(footer).toBeInTheDocument();
    expect(footer).toHaveClass("justify-end");

    fireEvent.click(screen.getByRole("button", { name: "Actions for Editor Example" }));
    const menu = await screen.findByRole("menu", { name: "Actions for Editor Example" });
    fireEvent.click(within(menu).getByText("Change role"));
    fireEvent.click(within(menu).getByText("Viewer"));

    await waitFor(() =>
      expect(props.changeMemberRole).toHaveBeenCalledWith({
        memberId: "mbr_editor",
        projectId: "prj_test",
        role: "viewer",
      }),
    );
  });

  it("hides auditor from the picker and applies a replacement role from the row", async () => {
    const props = renderCard();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Actions for Audit Example" }));
    const menu = await screen.findByRole("menu", { name: "Actions for Audit Example" });
    fireEvent.click(within(menu).getByText("Change role"));
    expect(within(menu).queryByText("Auditor")).not.toBeInTheDocument();
    fireEvent.click(within(menu).getByText("Editor"));

    await waitFor(() =>
      expect(props.changeMemberRole).toHaveBeenCalledWith({
        memberId: "mbr_auditor",
        projectId: "prj_test",
        role: "member",
      }),
    );
  });

  it("does not submit when the selected role does not change", async () => {
    renderCard({ members: [owner, editor] });

    fireEvent.click(screen.getByRole("button", { name: "Actions for Editor Example" }));
    const menu = await screen.findByRole("menu", { name: "Actions for Editor Example" });
    fireEvent.click(within(menu).getByText("Change role"));
    fireEvent.click(within(menu).getByText("Editor"));

    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it("hides the owner-only Admin tier from an admin manager", async () => {
    renderCard({ canAssignAdmin: false, members: [owner, editor] });

    fireEvent.click(screen.getByRole("button", { name: "Actions for Editor Example" }));
    const menu = await screen.findByRole("menu", { name: "Actions for Editor Example" });
    fireEvent.click(within(menu).getByText("Change role"));

    expect(within(menu).queryByText("Admin")).not.toBeInTheDocument();
    expect(within(menu).getByText("Editor")).toBeVisible();
    expect(within(menu).getByText("Viewer")).toBeVisible();
  });

  it("keeps role controls hidden for read-only team viewers", () => {
    renderCard({
      canManageTeam: false,
      members: [{ ...auditor, canChangeRole: false }],
      readOnly: true,
    });

    expect(screen.queryByRole("button", { name: /Change role/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Actions for / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite member" })).not.toBeInTheDocument();
  });

  it.each([
    {
      action: "transferOwnership" as const,
      confirmLabel: "Transfer ownership",
      dialogTitle: "Transfer project ownership",
      menuItemLabel: "Transfer ownership",
    },
    {
      action: "removeMember" as const,
      confirmLabel: "Remove member",
      dialogTitle: "Remove project member",
      menuItemLabel: "Remove from project",
    },
  ])(
    "requires explicit confirmation before $action",
    async ({ action, confirmLabel, dialogTitle, menuItemLabel }) => {
      const props = renderCard();

      fireEvent.click(screen.getByRole("button", { name: "Actions for Audit Example" }));
      const menu = await screen.findByRole("menu", { name: "Actions for Audit Example" });
      fireEvent.click(within(menu).getByText(menuItemLabel));

      expect(props[action]).not.toHaveBeenCalled();
      const dialog = await screen.findByRole("dialog", { name: dialogTitle });
      expect(within(dialog).getByRole("heading", { name: dialogTitle })).toBeVisible();

      fireEvent.click(within(dialog).getByRole("button", { name: confirmLabel }));

      await waitFor(() =>
        expect(props[action]).toHaveBeenCalledWith({
          memberId: "mbr_auditor",
          projectId: "prj_test",
        }),
      );
    },
  );
});
