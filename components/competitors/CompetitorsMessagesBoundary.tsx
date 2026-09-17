import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import type { ReactNode } from "react";

/**
 * Competitors includes the keyword drawer, so its explicit payload includes that consumer
 * contract: the drawer renders the markets schedule-assignment block (`projectMarkets`) and,
 * on its new-schedule step, `ScheduleEditor` (`projectRuns.schedules`).
 */
export async function CompetitorsMessagesBoundary({ children }: Readonly<{ children: ReactNode }>) {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, [
    "shared",
    "projectRankTracker",
    "projectCompetitors",
    "projectMarkets",
    "projectRuns",
  ]);
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
