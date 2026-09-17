import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import type { ReactNode } from "react";

/**
 * The `@context` parallel slot is handed to the workspace shell and renders inside the shell's
 * client boundary, which carries the shell catalogs alone. Keyword surfaces mounted there read
 * `projectRankTracker` (and, through the markets drawer, `projectMarkets`), so the slot declares
 * its own payload. A nested provider replaces rather than merges, so `shell` is restated here for
 * the header chrome this boundary wraps.
 */
export async function KeywordHeaderContextBoundary({
  children,
}: Readonly<{ children: ReactNode }>) {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, [
    "shared",
    "shell",
    "projectMarkets",
    "projectRankTracker",
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
