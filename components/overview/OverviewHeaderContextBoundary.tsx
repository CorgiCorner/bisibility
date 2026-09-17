import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { OverviewHeaderContext } from "@/components/overview/OverviewHeaderContext";
import type { OverviewView } from "@/components/overview/types";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";

/** The header slot is rendered beside, not beneath, the dashboard page boundary. */
export async function OverviewHeaderContextBoundary({
  options,
}: Readonly<{ options: OverviewView["toolbar"]["marketOptions"] }>) {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["shared", "projectDashboard"]);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <OverviewHeaderContext options={options} />
    </FeatureMessagesProvider>
  );
}
