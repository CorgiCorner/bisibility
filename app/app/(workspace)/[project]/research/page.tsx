import { ResearchWorkspace } from "@/components/research/ResearchWorkspace";
import { PageContent } from "@/components/shell/PageContent";
import { addKeywords } from "@/lib/actions/keyword";
import { researchKeywordsAction } from "@/lib/actions/keyword-research";
import { removeSavedKeywords, saveKeywords } from "@/lib/actions/saved-keyword";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { getCheckHealth } from "@/lib/queries/check-health";
import { getProjectCostContext } from "@/lib/queries/cost-calculator";
import { getKeywordResearchPageContext } from "@/lib/queries/keyword-research";

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
  const { project } = await routeParams;
  const { publicId } = await resolveProjectAccess(project);
  const params = await searchParams;
  const seed = paramValue(params?.seed)?.trim();
  const locationKey = paramValue(params?.location)?.trim();

  const [context, checkHealth, costContext, readable] = await Promise.all([
    getKeywordResearchPageContext(publicId),
    getCheckHealth(publicId),
    getProjectCostContext(publicId),
    requireReadableProject(publicId),
  ]);
  const role = getProjectRole(readable.actor, readable.project.id);

  return (
    <PageContent>
      <ResearchWorkspace
        addKeywordsAction={addKeywords}
        canDeleteSavedKeywords={canProjectAction(role, "delete", "keyword")}
        checkHealth={checkHealth}
        context={context}
        costContext={costContext}
        prefill={seed ? { locationKey: locationKey || undefined, seed } : undefined}
        removeSavedKeywordsAction={removeSavedKeywords}
        researchAction={researchKeywordsAction}
        saveKeywordsAction={saveKeywords}
      />
    </PageContent>
  );
}
