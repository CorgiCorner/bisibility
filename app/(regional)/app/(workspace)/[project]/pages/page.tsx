import { ProjectChallengeCard } from "@/components/challenge-report/ProjectChallengeCard";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { ProjectPagesScreen } from "@/components/pages/ProjectPagesScreen";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { loadExistingVsNewAction, takePageSnapshotAction } from "@/lib/actions/page-snapshot";
import {
  loadPageTags,
  previewTagPageRule,
  removeTagFromPages,
  saveTagPageRule,
  setManualPageTags,
} from "@/lib/actions/page-tags";
import { checkSelectedPageVitalsAction } from "@/lib/actions/page-vitals";
import {
  addManualProjectPagesAction,
  loadProjectPagesAction,
  refreshProjectPagesAction,
} from "@/lib/actions/pages";
import { loadPagesCompareAction } from "@/lib/actions/pages-compare";
import {
  markProjectChallengeDayAction,
  startProjectChallengeAction,
} from "@/lib/actions/project-challenge";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { projectSeoChallengeEnabled } from "@/lib/challenge-report/feature";
import { readProjectChallenge } from "@/lib/challenge-report/project-challenge";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import { loadProjectPagesScreen } from "@/lib/pages/screen";
import {
  fillProjectPagesCompareQuery,
  parseProjectPagesQuery,
  projectPagesHref,
} from "@/lib/pages/url-state";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { redirect } from "next/navigation";

type PagesPageProps = {
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProjectPagesPage({ params, searchParams }: Readonly<PagesPageProps>) {
  const [{ project }, runtime, queryParams] = await Promise.all([
    params,
    resolveRegionalDocumentLocale(),
    searchParams,
  ]);
  const messages = await loadCoreMessages(runtime.locale, [
    "shared",
    "account",
    "challengeReport",
    "projectPages",
    "projectSearchInsights",
  ]);
  const { publicId } = await resolveProjectAccess(project);
  const { actor, project: readable } = await requireReadableProject(publicId);
  const query = parseProjectPagesQuery(queryParams);
  const role = getProjectRole(actor, readable.id);
  const readOnly = isProjectReadOnly(readable.writeMode);
  const canWrite = canProjectAction(role, "update", "project") && !readOnly;
  const canCreateTags = canProjectAction(role, "create", "keyword") && !readOnly;
  const canEditTags = canProjectAction(role, "update", "keyword") && !readOnly;
  const canDeleteTags = canProjectAction(role, "delete", "keyword") && !readOnly;
  const [view, challenge] = await Promise.all([
    loadProjectPagesScreen(readable.id, query, { syncIfEmpty: canWrite }),
    readProjectChallenge(actor.id, readable.id),
  ]);
  const canStartChallenge =
    (await projectSeoChallengeEnabled()) &&
    canProjectAction(role, "create", "project") &&
    !readOnly;
  const compareQuery = fillProjectPagesCompareQuery(query, view.compare);
  if (compareQuery) redirect(projectPagesHref(publicId, compareQuery));

  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PageContent>
        {canStartChallenge || challenge ? (
          <ProjectChallengeCard
            canStart={canStartChallenge}
            challenge={challenge}
            mark={markProjectChallengeDayAction}
            projectId={publicId}
            start={startProjectChallengeAction}
          />
        ) : null}
        <ProjectPagesScreen
          actions={{
            addManual: addManualProjectPagesAction,
            checkVitals: checkSelectedPageVitalsAction,
            load: loadProjectPagesAction,
            loadCompare: loadPagesCompareAction.bind(null, publicId),
            loadComparison: loadExistingVsNewAction.bind(null, publicId),
            loadTags: loadPageTags.bind(null, { projectId: publicId }),
            previewRule: previewTagPageRule.bind(null, publicId),
            refresh: refreshProjectPagesAction,
            removeFromPages: removeTagFromPages.bind(null, publicId),
            saveRule: saveTagPageRule.bind(null, publicId),
            setManual: setManualPageTags.bind(null, publicId),
            takeSnapshot: takePageSnapshotAction,
          }}
          canCreateTags={canCreateTags}
          canDeleteTags={canDeleteTags}
          canEditTags={canEditTags}
          canWrite={canWrite}
          initialCompare={view.compare}
          initialComparison={view.comparison}
          initialList={view.list}
          initialQuery={query}
          initialSnapshot={view.snapshot}
          initialTags={view.tags}
          projectId={publicId}
          sources={view.sources}
        />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
