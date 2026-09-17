import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import type { ReactNode } from "react";

/**
 * Keeps the Markets route independent from the generic keyword boundary while
 * composing the two embedded feature seams it actually renders.
 */
export async function loadProjectMarketsMessages() {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, [
    "shared",
    "projectMarkets",
    "projectRankTracker",
    "projectRuns",
  ]);
  return { messages, runtime };
}

export async function ProjectMarketsMessagesBoundary({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const { messages, runtime } = await loadProjectMarketsMessages();

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
