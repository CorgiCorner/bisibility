import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { TeamSettingsContent } from "@/components/settings/team/TeamSettingsContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import {
  changeMemberRole,
  inviteMember,
  removeMember,
  resendInvite,
  revokeInvite,
  transferOwnership,
} from "@/lib/actions/team";
import { getResolvedDateFormat } from "@/lib/dates/request";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getTeamAccess } from "@/lib/queries/team";
import { asProjectRef } from "@/lib/routing/app-path";

type TeamSettingsPageProps = { params: Promise<{ project: string }> };

export default async function TeamSettingsPage({ params }: Readonly<TeamSettingsPageProps>) {
  const { project: projectRef } = await params;
  const { resolved: dateFormat } = await getResolvedDateFormat();
  const [{ project }, team, runtime] = await Promise.all([
    requireReadableProject(projectRef),
    getTeamAccess(projectRef, dateFormat),
    resolveRegionalDocumentLocale(),
  ]);
  const messages = await loadCoreMessages(runtime.locale, [
    "shared",
    "projectSettingsShell",
    "projectSettingsTeam",
  ]);

  return (
    <SettingsShell activeSection="team" projectRef={asProjectRef(project.publicId)}>
      <FeatureMessagesProvider
        locale={runtime.locale}
        messages={messages}
        timeZone={runtime.timeZone}
      >
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
      </FeatureMessagesProvider>
    </SettingsShell>
  );
}
