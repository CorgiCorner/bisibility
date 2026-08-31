import { InstallPageContent } from "@/components/install/InstallPageContent";
import { PageContent } from "@/components/shell/PageContent";
import { absoluteUrl, getOriginFromHeaders } from "@/lib/agent-ready/origin";
import { isCloud } from "@/lib/deployment/deployment";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { getPreferences } from "@/lib/queries/account";
import { getInstallApiKeySummary } from "@/lib/queries/install";
import { headers } from "next/headers";

type InstallPageProps = { params: Promise<{ project: string }> };

export default async function InstallPage({ params }: Readonly<InstallPageProps>) {
  const { project } = await params;
  const [access, preferences, requestHeaders] = await Promise.all([
    resolveProjectAccess(project),
    getPreferences(),
    headers(),
  ]);
  const origin = getOriginFromHeaders(requestHeaders);
  const mcpUrl = absoluteUrl(origin, "/api/mcp");
  const apiKey = await getInstallApiKeySummary(access.publicId, {
    dateFormat: preferences.dateFormat,
  });

  return (
    <PageContent>
      <InstallPageContent
        apiKey={apiKey}
        isCloudHosted={isCloud}
        mcpUrl={mcpUrl}
        origin={origin}
        projectRef={access.publicId}
      />
    </PageContent>
  );
}
