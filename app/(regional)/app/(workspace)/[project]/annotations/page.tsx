import { AnnotationsBoard } from "@/components/annotations/AnnotationsBoard";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { annotationFilterFromQuery } from "@/lib/annotations/types";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { getQueryActor, resolveProjectAccess } from "@/lib/queries/_auth";
import { getAnnotationsView } from "@/lib/queries/annotations";
import { appPath } from "@/lib/routing/app-path";

type AnnotationsPageProps = {
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AnnotationsPage({
  params: routeParams,
  searchParams,
}: Readonly<AnnotationsPageProps>) {
  const [{ project }, runtime] = await Promise.all([routeParams, resolveRegionalDocumentLocale()]);
  const messages = await loadCoreMessages(runtime.locale, ["shared", "projectTimeline"]);
  const access = await resolveProjectAccess(project);
  const [params, actor] = await Promise.all([searchParams, getQueryActor()]);
  const role = getProjectRole(actor, access.projectId);
  const view = await getAnnotationsView(access.publicId);

  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PageContent>
        <AnnotationsBoard
          canCreate={canProjectAction(role, "create", "signal")}
          canDelete={canProjectAction(role, "delete", "signal")}
          developersHref={appPath(access.publicId, "settings", "developers")}
          hideAutomatic={first(params?.auto) === "0"}
          initialFilter={annotationFilterFromQuery(first(params?.filter))}
          initialSelected={first(params?.q) ?? null}
          locale={runtime.locale}
          projectId={access.publicId}
          view={view}
        />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
