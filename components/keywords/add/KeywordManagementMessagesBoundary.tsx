import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import type { ReactNode } from "react";

export async function loadKeywordManagementMessages() {
  const runtime = await resolveRegionalDocumentLocale();
  // `projectMarkets` is part of the slice, not an extra: the add-keyword drawer renders the
  // markets schedule-assignment block, so the boundary that mounts the drawer owns its copy.
  // That block is `NewMarketScheduleEditor` -> `ScheduleEditor`, which reads
  // `projectRuns.schedules`, so the run slice belongs to the same payload.
  const messages = await loadCoreMessages(runtime.locale, [
    "shared",
    "projectMarkets",
    "projectRankTracker",
    "projectRuns",
  ]);
  return { messages, runtime };
}

/**
 * Supplies the keyword-management slice to reusable keyword flows outside the
 * rank-tracker route. Keep this boundary narrow instead of expanding the app layout catalog.
 */
export async function KeywordManagementMessagesBoundary({
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
      {children}
    </FeatureMessagesProvider>
  );
}
