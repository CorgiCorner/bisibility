import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { InstallPageContent } from "@/components/install/InstallPageContent";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { absoluteUrl, getOriginFromHeaders } from "@/lib/agent-ready/origin";
import { isCloud } from "@/lib/deployment/deployment";
import { getMcpToolDefinitions } from "@/lib/mcp/definitions";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { getInstallApiKeySummary, getInstallHasKeywordAndCheck } from "@/lib/queries/install";
import { headers } from "next/headers";

type InstallPageProps = { params: Promise<{ project: string }> };

export default async function InstallPage({ params }: Readonly<InstallPageProps>) {
  const [{ project }, runtime] = await Promise.all([params, resolveRegionalDocumentLocale()]);
  const [access, requestHeaders, messages] = await Promise.all([
    resolveProjectAccess(project),
    headers(),
    loadCoreMessages(runtime.locale, ["shared", "projectInstall"]),
  ]);
  const origin = getOriginFromHeaders(requestHeaders);
  const mcpUrl = absoluteUrl(origin, "/api/mcp");
  const definitions = getMcpToolDefinitions();
  const mcpToolCounts = {
    readOnly: definitions.filter((definition) => definition.annotations.readOnlyHint).length,
    total: definitions.length,
  };
  const [apiKey, hasKeywordAndCheck] = await Promise.all([
    getInstallApiKeySummary(access.publicId),
    getInstallHasKeywordAndCheck(access.publicId),
  ]);

  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PageContent>
        <InstallPageContent
          apiKey={apiKey}
          hasKeywordAndCheck={hasKeywordAndCheck}
          isCloudHosted={isCloud}
          mcpToolCounts={mcpToolCounts}
          mcpUrl={mcpUrl}
          origin={origin}
          projectRef={access.publicId}
        />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
