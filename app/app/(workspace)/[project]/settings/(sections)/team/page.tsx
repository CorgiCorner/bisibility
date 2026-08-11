import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { TeamSettingsContent } from "@/components/settings/team/TeamSettingsContent";
import {
  changeMemberRole,
  inviteMember,
  removeMember,
  resendInvite,
  revokeInvite,
  transferOwnership,
} from "@/lib/actions/team";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getTeamAccess } from "@/lib/queries/team";
import { asProjectRef } from "@/lib/routing/app-path";

type TeamSettingsPageProps = { params: Promise<{ project: string }> };

export default async function TeamSettingsPage({ params }: Readonly<TeamSettingsPageProps>) {
  const { project: projectRef } = await params;
  const [{ project }, team] = await Promise.all([
    requireReadableProject(projectRef),
    getTeamAccess(projectRef),
  ]);

  return (
    <SettingsShell activeSection="team" projectRef={asProjectRef(project.publicId)}>
      <div data-settings-section-slot="team">
        <TeamSettingsContent
          actions={{
            changeMemberRole,
            inviteMember,
            removeMember,
            resendInvite,
            revokeInvite,
            transferOwnership,
          }}
          domain={project.domain ?? ""}
          projectId={project.publicId}
          readOnly={project.writeMode !== "active"}
          team={team}
        />
      </div>
    </SettingsShell>
  );
}
