import { DevelopersSettingsContent } from "@/components/settings/developers/DevelopersSettingsContent";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { issueApiKey, regenerateApiKey, revokeApiKey } from "@/lib/actions/apiKey";
import {
  createIngestHook,
  deleteIngestHook,
  disableIngestHook,
  rotateIngestHook,
  sendIngestHookTest,
} from "@/lib/actions/ingest-hooks";
import { absoluteUrl, getOriginFromHeaders } from "@/lib/agent-ready/origin";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getPreferences } from "@/lib/queries/account";
import { getIngestHooks } from "@/lib/queries/ingest-hooks";
import { getSettings } from "@/lib/queries/settings";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { headers } from "next/headers";

type DevelopersSettingsPageProps = { params: Promise<{ project: string }> };

export default async function DevelopersSettingsPage({
  params,
}: Readonly<DevelopersSettingsPageProps>) {
  const { project: projectRef } = await params;
  const preferences = await getPreferences();
  const [settings, access, hooks] = await Promise.all([
    getSettings(projectRef, { preferences }),
    requireReadableProject(projectRef),
    getIngestHooks(projectRef, { preferences }),
  ]);
  const role = getProjectRole(access.actor, access.project.id);
  const canManage =
    access.project.writeMode === "active" &&
    canProjectAction(role, "manage", "api_key") &&
    canProjectAction(role, "manage", "ingest_hook");
  const requestHeaders = await headers();
  const endpointUrl = absoluteUrl(getOriginFromHeaders(requestHeaders), "/api/ingest/deploy");
  const publicId = asProjectRef(access.project.publicId);

  return (
    <SettingsShell activeSection="developers" projectRef={publicId}>
      <div data-settings-section-slot="developers">
        <DevelopersSettingsContent
          apiKeys={settings.apiKeys}
          canManage={canManage}
          createHook={createIngestHook}
          deleteHook={deleteIngestHook}
          disableHook={disableIngestHook}
          docsHref={appPath(publicId, "docs")}
          endpointUrl={endpointUrl}
          hooks={hooks}
          issueKey={issueApiKey}
          projectId={settings.project.projectId}
          regenerateKey={regenerateApiKey}
          revokeKey={revokeApiKey}
          rotateHook={rotateIngestHook}
          sendTestHook={sendIngestHookTest}
        />
      </div>
    </SettingsShell>
  );
}
