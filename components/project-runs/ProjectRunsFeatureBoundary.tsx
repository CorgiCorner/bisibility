import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import type { ReactNode } from "react";

export async function loadProjectRunsMessages() {
  const runtime = await resolveRegionalDocumentLocale();
  return {
    ...runtime,
    messages: await loadCoreMessages(runtime.locale, ["shared", "projectRuns"]),
  };
}

type ProjectRunsMessagesRuntime = Awaited<ReturnType<typeof loadProjectRunsMessages>>;

/** Provides only the shared and project-runs payload required by this route family. */
export async function ProjectRunsFeatureBoundary({
  children,
  runtime,
}: Readonly<{ children: ReactNode; runtime?: ProjectRunsMessagesRuntime }>) {
  const resolvedRuntime = runtime ?? (await loadProjectRunsMessages());
  return (
    <FeatureMessagesProvider
      locale={resolvedRuntime.locale}
      messages={resolvedRuntime.messages}
      timeZone={resolvedRuntime.timeZone}
    >
      {children}
    </FeatureMessagesProvider>
  );
}
