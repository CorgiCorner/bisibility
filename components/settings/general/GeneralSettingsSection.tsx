import { GeneralSettingsContent } from "@/components/settings/general/GeneralSettingsContent";
import type { GeneralProjectDetails } from "@/components/settings/general/ProjectDetailsCard";
import type { GeneralTag } from "@/components/settings/general/TagsSegmentsCard";
import { confirmProjectDomainChange } from "@/lib/actions/project-domain-change";
import { updateProjectDetails } from "@/lib/actions/settings";
import { createTagResult, deleteTagResult } from "@/lib/actions/tags";

type GeneralSettingsSectionProps = {
  canCreateTags: boolean;
  canDeleteTags: boolean;
  canEditProject: boolean;
  project: GeneralProjectDetails;
  tags: readonly GeneralTag[];
};

export function GeneralSettingsSection({
  canCreateTags,
  canDeleteTags,
  canEditProject,
  project,
  tags,
}: Readonly<GeneralSettingsSectionProps>) {
  const contentKey = JSON.stringify({ project, tags });

  return (
    <GeneralSettingsContent
      canCreateTags={canCreateTags}
      canDeleteTags={canDeleteTags}
      canEditProject={canEditProject}
      createTag={createTagResult}
      deleteTag={deleteTagResult}
      key={contentKey}
      project={project}
      requestDomainChange={confirmProjectDomainChange}
      tags={tags}
      updateProject={updateProjectDetails}
    />
  );
}
