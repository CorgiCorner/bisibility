import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { loadKeywordManagementMessages } from "@/components/keywords/add/KeywordManagementMessagesBoundary";
import { KeywordImportProvider } from "@/components/keywords/import/KeywordImportProvider";
import type { ReactNode } from "react";

export async function RankTrackerFeatureBoundary({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const { messages, runtime } = await loadKeywordManagementMessages();
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      {/* The import wizard is a keyword-management surface and is rendered by this provider, not
          by the document shell: mounted at the document root it sat outside every feature
          boundary and could not resolve a single one of its own messages. */}
      <KeywordImportProvider>{children}</KeywordImportProvider>
    </FeatureMessagesProvider>
  );
}
