import { StoredKeywordResearchView } from "@/components/demo-research/StoredKeywordResearchView";
import { StoredResultSelector } from "@/components/demo-research/StoredResultSelector";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import {
  listDemoKeywordResearchAction,
  readDemoKeywordResearchAction,
} from "@/lib/actions/demo-research";
import { getDemoResearchAccess } from "@/lib/queries/demo-research";
import Link from "next/link";

type ResearchPageProps = {
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function paramValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ResearchPage({
  params: routeParams,
  searchParams,
}: Readonly<ResearchPageProps>) {
  const [{ project }, params, runtime] = await Promise.all([
    routeParams,
    searchParams,
    resolveRegionalDocumentLocale(),
  ]);
  // One boundary for the whole route. A nested provider REPLACES the payload instead of merging
  // it, so wrapping the workspace in the keyword-management boundary dropped `projectResearch`
  // for every descendant; `projectMarkets` is here because the tracking drawer renders the
  // markets schedule-assignment block.
  const messages = await loadCoreMessages(runtime.locale, [
    "shared",
    "projectMarkets",
    "projectRankTracker",
    "projectResearch",
    "projectRuns",
  ]);
  const t = createIntlTranslator(runtime.locale, messages, { timeZone: runtime.timeZone });
  const demo = await getDemoResearchAccess(project);
  const demoManage = paramValue(params?.demoManage) === "1";

  if (demo && !(demo.actorKind === "owner" && demoManage)) {
    const saved = await listDemoKeywordResearchAction({ projectId: demo.project.publicId });
    const requestedKey = paramValue(params?.saved);
    const requestedSeed = paramValue(params?.seed)?.trim().toLowerCase();
    const selected =
      saved.find((item) => item.requestKey === requestedKey) ??
      saved.find((item) => item.seed.toLowerCase() === requestedSeed) ??
      saved[0];
    const result = selected
      ? await readDemoKeywordResearchAction({
          projectId: demo.project.publicId,
          requestKey: selected.requestKey,
        })
      : null;

    return (
      <FeatureMessagesProvider
        locale={runtime.locale}
        messages={messages}
        timeZone={runtime.timeZone}
      >
        <PageContent>
          <section className="grid min-w-0 gap-4">
            <StoredResultSelector
              actorKind={demo.actorKind}
              module="keywordResearch"
              options={saved.map((item) => ({
                label: `${item.seed} - ${item.countryCode}/${item.languageCode}${item.partial ? ` (${t("projectResearch.page.partial")})` : ""}`,
                value: item.requestKey,
              }))}
              selectedValue={selected?.requestKey}
            />
            <StoredKeywordResearchView result={result} />
          </section>
        </PageContent>
      </FeatureMessagesProvider>
    );
  }

  const [
    { ResearchWorkspace },
    { addKeywords },
    { researchKeywordsAction },
    { removeSavedKeywords, saveKeywords },
    { getProjectRole },
    { canProjectAction },
    { requireReadableProject, resolveProjectAccess },
    { getCheckHealth },
    { getProjectCostContext },
    { getKeywordResearchPageContext },
    { getProjectMarkets },
  ] = await Promise.all([
    import("@/components/research/ResearchWorkspace"),
    import("@/lib/actions/keyword"),
    import("@/lib/actions/keyword-research"),
    import("@/lib/actions/saved-keyword"),
    import("@/lib/auth/authorize"),
    import("@/lib/auth/capabilities"),
    import("@/lib/queries/_auth"),
    import("@/lib/queries/check-health"),
    import("@/lib/queries/cost-calculator"),
    import("@/lib/queries/keyword-research"),
    import("@/lib/queries/project-markets"),
  ]);
  const { publicId } = await resolveProjectAccess(project);
  const seed = paramValue(params?.seed)?.trim();
  const locationKey = paramValue(params?.location)?.trim();
  const [context, checkHealth, costContext, readable, projectMarkets] = await Promise.all([
    getKeywordResearchPageContext(publicId),
    getCheckHealth(publicId),
    getProjectCostContext(publicId),
    requireReadableProject(publicId),
    getProjectMarkets(publicId),
  ]);
  const role = getProjectRole(readable.actor, readable.project.id);

  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PageContent>
        {demo ? (
          <Link
            className="mb-3 inline-flex font-semibold text-accent-text hover:underline"
            href="?"
          >
            {t("projectResearch.page.backToSaved")}
          </Link>
        ) : null}
        <ResearchWorkspace
          addKeywordsAction={addKeywords}
          canDeleteSavedKeywords={canProjectAction(role, "delete", "keyword")}
          checkHealth={checkHealth}
          context={context}
          costContext={costContext}
          prefill={seed ? { locationKey: locationKey || undefined, seed } : undefined}
          projectMarkets={projectMarkets}
          removeSavedKeywordsAction={removeSavedKeywords}
          researchAction={researchKeywordsAction}
          saveKeywordsAction={saveKeywords}
        />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
