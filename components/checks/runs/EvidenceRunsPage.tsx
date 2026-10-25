import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { parseEvidenceRunsQuery } from "@/lib/checks/evidence-runs-query";
import { getCheckRunsView } from "@/lib/queries/check-runs-view";
import { z } from "zod";
import { EvidenceRunsWorkspace } from "./EvidenceRunsWorkspace";

export async function EvidenceRunsPage({
  projectRef,
  search,
}: Readonly<{ projectRef: string; search: URLSearchParams }>) {
  const query = parseEvidenceRunsQuery(search);
  let cursor: { checkedAt: string; id: string } | undefined;
  try {
    cursor = z
      .object({ checkedAt: z.iso.datetime(), id: z.string().max(100) })
      .parse(JSON.parse(query.cursor ?? "null"));
  } catch {
    cursor = undefined;
  }
  const now = new Date();
  const [view, runtime] = await Promise.all([
    getCheckRunsView(projectRef, { ...query, cursor, status: query.status, now, limit: 50 }),
    resolveRegionalDocumentLocale(),
  ]);
  const messages = await loadCoreMessages(runtime.locale, [
    "shared",
    "projectRankTracker",
    "projectRuns",
  ]);
  return (
    <FeatureMessagesProvider {...runtime} messages={messages}>
      <PageContent>
        <EvidenceRunsWorkspace
          projectRef={projectRef}
          query={query}
          view={view}
          now={now.toISOString()}
        />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
