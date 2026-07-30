import { UsageBillingSection } from "@/components/settings/billing/UsageBillingSection";
import { DangerZone } from "@/components/settings/danger/DangerZone";
import { TeamRoles } from "@/components/settings/team/TeamRoles";
import { canProjectAction, canReadProjectAudit } from "@/lib/auth/capabilities";
import type { Role } from "@/lib/generated/prisma/client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewWorkspaceSettings } from "./NewWorkspaceSettings";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const baseData = {
  devKey: null,
  memberCount: 3,
  owner: { email: "owner@example.com", initials: "OU", name: "Owner User" },
  workspace: { domain: "example.com", name: "Example", projectId: "prj_1" },
};
const apiKeys = [
  {
    createdLabel: "created today",
    expiresLabel: "expires Oct 24, 2026",
    id: "key_1",
    isExpired: false,
    lastUsedLabel: "never used",
    maskedValue: "bsb_key_live_abc123******",
    name: "Production",
  },
];
const members = [
  {
    color: "accent" as const,
    email: "owner@example.com",
    id: "owner_1",
    initials: "OU",
    name: "Owner User",
    role: "Owner" as const,
    roleValue: "owner" as const,
  },
  {
    color: "blue" as const,
    email: "member@example.com",
    id: "member_1",
    initials: "MU",
    name: "Member User",
    role: "Editor" as const,
    roleValue: "member" as const,
  },
];

describe("NewWorkspaceSettings", () => {
  it("does not claim sole membership or a generated key when the data says otherwise", () => {
    render(
      <NewWorkspaceSettings
        apiKeys={[]}
        canDeleteWorkspace
        canManageWorkspace
        data={baseData}
        teamSection={<p>3 members have access to this workspace.</p>}
      />,
    );

    expect(screen.getByText("3 members have access to this workspace.")).toBeVisible();
    expect(screen.queryByText(/you're the only member/i)).not.toBeInTheDocument();
    expect(screen.getByText("No API keys yet")).toBeVisible();
    expect(screen.queryByText(/a development key was generated/i)).not.toBeInTheDocument();
    expect(
      screen.getByText("Delete this workspace and all its data. This cannot be undone."),
    ).toBeVisible();
  });

  it("hides admin and owner controls from read-only roles", () => {
    render(
      <NewWorkspaceSettings
        canDeleteWorkspace={false}
        canManageWorkspace={false}
        apiKeys={[]}
        data={baseData}
        teamSection={<section>Team</section>}
      />,
    );

    expect(screen.getByText("Providers")).toBeVisible();
    expect(screen.getByText("API keys")).toBeVisible();
    expect(screen.getByText("Team")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Connect" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create key" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite member" })).not.toBeInTheDocument();
    expect(screen.queryByText("Danger zone")).not.toBeInTheDocument();
  });

  it("shows admin controls without exposing owner-only deletion", () => {
    render(
      <NewWorkspaceSettings
        apiKeys={[]}
        canDeleteWorkspace={false}
        canManageWorkspace
        data={baseData}
        issueKey={vi.fn()}
        teamSection={<button type="button">Invite member</button>}
      />,
    );

    expect(screen.getByRole("link", { name: "Connect" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create key" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invite member" })).toBeInTheDocument();
    expect(screen.queryByText("Danger zone")).not.toBeInTheDocument();
  });

  it("renders migration cancellation for a held empty workspace", async () => {
    render(
      <NewWorkspaceSettings
        apiKeys={[]}
        canDeleteWorkspace={false}
        canManageWorkspace
        data={baseData}
        migrationSection={
          <DangerZone
            cancelMigration={vi.fn()}
            canDeleteProject={false}
            canManageMigration
            direction="to-cloud"
            domain="example.com"
            migrationHold
            projectId="prj_1"
            showInstanceMigration
            writeMode="migration_hold"
          />
        }
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /Continue migration/i }));

    expect(screen.getByRole("button", { name: "Cancel migration" })).toBeVisible();
  });

  it.each(["viewer", "auditor", "member", "admin", "owner"] satisfies Role[])(
    "renders empty-settings audit navigation for the %s role",
    (role) => {
      const canReadAudit = canReadProjectAudit(role);

      render(
        <NewWorkspaceSettings
          apiKeys={[]}
          canDeleteWorkspace={false}
          canManageWorkspace={false}
          canReadAudit={canReadAudit}
          data={baseData}
        />,
      );

      expect(Boolean(screen.queryByRole("link", { name: /audit log/i }))).toBe(canReadAudit);
    },
  );

  it.each(["viewer", "auditor", "member", "admin", "owner"] satisfies Role[])(
    "renders empty-workspace API key actions for the %s role at the admin threshold",
    (role) => {
      const canManage = canProjectAction(role, "delete", "api_key");
      render(
        <NewWorkspaceSettings
          apiKeys={apiKeys}
          canDeleteWorkspace={false}
          canManageWorkspace={canManage}
          data={baseData}
          issueKey={vi.fn()}
          regenerateKey={vi.fn()}
          revokeKey={vi.fn()}
        />,
      );

      expect(Boolean(screen.queryByRole("button", { name: "Create key" }))).toBe(canManage);
      expect(Boolean(screen.queryByRole("button", { name: "Roll Production key" }))).toBe(
        canManage,
      );
      expect(Boolean(screen.queryByRole("button", { name: "Revoke Production key" }))).toBe(
        canManage,
      );
    },
  );

  it("revokes an active key through the shared confirmation flow", async () => {
    const revokeKey = vi.fn().mockResolvedValue({ revoked: true });
    render(
      <NewWorkspaceSettings
        apiKeys={apiKeys}
        canDeleteWorkspace={false}
        canManageWorkspace
        data={baseData}
        revokeKey={revokeKey}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Revoke Production key" }));
    expect(screen.getByRole("heading", { name: "Revoke API key" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Revoke key" }));

    expect(revokeKey).toHaveBeenCalledWith({ apiKeyId: "key_1", projectId: "prj_1" });
  });

  it.each(["viewer", "auditor", "member", "admin", "owner"] satisfies Role[])(
    "renders empty-workspace owner sections only for the %s role",
    (role) => {
      const canManageWorkspace = canProjectAction(role, "manage", "project");
      const canManageBilling = canProjectAction(role, "manage", "billing");
      const canTransferOwnership = canProjectAction(role, "manage", "ownership");
      const canDeleteWorkspace = canProjectAction(role, "delete", "project");
      render(
        <NewWorkspaceSettings
          apiKeys={[]}
          billingSection={
            canManageBilling ? (
              <UsageBillingSection
                email="owner@example.com"
                projectId="prj_1"
                submitInterest={vi.fn()}
                variant="self-host"
              />
            ) : null
          }
          canDeleteWorkspace={canDeleteWorkspace}
          canManageWorkspace={canManageWorkspace}
          data={baseData}
          teamSection={
            <TeamRoles
              canManageTeam={canManageWorkspace}
              canTransferOwnership={canTransferOwnership}
              members={members}
              projectId="prj_1"
              transferOwnership={vi.fn()}
            />
          }
        />,
      );

      expect(Boolean(screen.queryByText("Usage & billing"))).toBe(canManageBilling);
      expect(
        Boolean(screen.queryByRole("button", { name: "Transfer ownership to Member User" })),
      ).toBe(canTransferOwnership);
      expect(Boolean(screen.queryByText("Danger zone"))).toBe(canDeleteWorkspace);
    },
  );
});
