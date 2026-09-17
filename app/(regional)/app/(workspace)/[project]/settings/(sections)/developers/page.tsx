import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { DevelopersSettingsContent } from "@/components/settings/developers/DevelopersSettingsContent";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
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
import { getIngestHooks } from "@/lib/queries/ingest-hooks";
import { getSettings } from "@/lib/queries/settings";
import { asProjectRef } from "@/lib/routing/app-path";
import { headers } from "next/headers";

type DevelopersSettingsPageProps = { params: Promise<{ project: string }> };

export default async function DevelopersSettingsPage({
  params,
}: Readonly<DevelopersSettingsPageProps>) {
  const { project: projectRef } = await params;
  const [settings, access, hooks, runtime] = await Promise.all([
    getSettings(projectRef),
    requireReadableProject(projectRef),
    getIngestHooks(projectRef),
    resolveRegionalDocumentLocale(),
  ]);
  const messages = await loadCoreMessages(runtime.locale, [
    "shared",
    "projectSettingsShell",
    "projectSettingsDevelopers",
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
      <FeatureMessagesProvider
        locale={runtime.locale}
        messages={messages}
        timeZone={runtime.timeZone}
      >
        <div data-settings-section-slot="developers">
          <DevelopersSettingsContent
            apiKeys={settings.apiKeys}
            canManage={canManage}
            createHook={createIngestHook}
            deleteHook={deleteIngestHook}
            disableHook={disableIngestHook}
            docsHref="/docs/quickstart"
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
      </FeatureMessagesProvider>
    </SettingsShell>
  );
}
