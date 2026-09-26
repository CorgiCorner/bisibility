import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { domainOverviewCacheTtlSeconds } from "@/lib/domain-overview/cache-policy";
import type { ReactNode } from "react";
import { DomainOverviewCacheProvider } from "./DomainOverviewCacheProvider";

/** Supplies domain-overview copy only to the normal interactive workspace. */
export async function DomainOverviewMessagesBoundary({
  children,
}: Readonly<{ children: ReactNode }>) {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["shared", "projectDomainOverview"]);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <DomainOverviewCacheProvider ttlSeconds={domainOverviewCacheTtlSeconds()}>
        {children}
      </DomainOverviewCacheProvider>
    </FeatureMessagesProvider>
  );
}
