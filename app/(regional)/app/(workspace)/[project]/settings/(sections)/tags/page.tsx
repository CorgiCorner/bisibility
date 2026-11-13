import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { SettingsTagsSection } from "@/components/settings/tags/SettingsTagsSection";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { previewTagPageRule, saveTagPageRule } from "@/lib/actions/page-tags";
import { mergeTagResult } from "@/lib/actions/tag-merge";
import { deleteTagResult, renameTagResult } from "@/lib/actions/tags";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getSettingsTags } from "@/lib/queries/tag-settings";
import { asProjectRef } from "@/lib/routing/app-path";

type TagsSettingsPageProps = { params: Promise<{ project: string }> };

export default async function TagsSettingsPage({ params }: Readonly<TagsSettingsPageProps>) {
  const { project: projectRef } = await params;
  const { actor, project } = await requireReadableProject(projectRef);
  const [model, runtime] = await Promise.all([
    getSettingsTags(project.id),
    resolveRegionalDocumentLocale(),
  ]);
  const messages = await loadCoreMessages(runtime.locale, [
    "shared",
    "projectSettingsShell",
    "projectSettingsTags",
    "projectPages",
  ]);
  const role = getProjectRole(actor, project.id);
  const writable = !isProjectReadOnly(project.writeMode);
  const projectId = project.publicId;

  return (
    <SettingsShell activeSection="tags" projectRef={asProjectRef(projectId)}>
      <div data-settings-section-slot="tags">
        <FeatureMessagesProvider
          locale={runtime.locale}
          messages={messages}
          timeZone={runtime.timeZone}
        >
          <SettingsTagsSection
            actions={{
              deleteTag: deleteTagResult,
              mergeTag: mergeTagResult,
              previewRule: previewTagPageRule.bind(null, projectId),
              renameTag: renameTagResult,
              saveRule: saveTagPageRule.bind(null, projectId),
            }}
            canCreate={writable && canProjectAction(role, "create", "keyword")}
            canDelete={writable && canProjectAction(role, "delete", "keyword")}
            canEdit={writable && canProjectAction(role, "update", "keyword")}
            projectId={projectId}
            rows={model.rows}
            sitemaps={model.sitemaps}
          />
        </FeatureMessagesProvider>
      </div>
    </SettingsShell>
  );
}
