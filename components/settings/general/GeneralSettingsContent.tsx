"use client";

import type { DomainChangeRequest } from "@/components/settings/general/DomainChangeConfirmation";
import {
  type GeneralProjectDetails,
  ProjectDetailsCard,
  type UpdateProjectDetails,
} from "@/components/settings/general/ProjectDetailsCard";
import {
  type CreateTagAction,
  type DeleteTagAction,
  type GeneralTag,
  TagsSegmentsCard,
} from "@/components/settings/general/TagsSegmentsCard";

export type GeneralSettingsContentProps = {
  canCreateTags: boolean;
  canDeleteTags: boolean;
  canEditProject: boolean;
  createTag?: CreateTagAction;
  deleteTag?: DeleteTagAction;
  initialDomainConfirmationOpen?: boolean;
  project: GeneralProjectDetails;
  requestDomainChange: (request: DomainChangeRequest) => Promise<unknown>;
  tags: readonly GeneralTag[];
  updateProject: UpdateProjectDetails;
};

export function GeneralSettingsContent({
  canCreateTags,
  canDeleteTags,
  canEditProject,
  createTag,
  deleteTag,
  initialDomainConfirmationOpen,
  project,
  requestDomainChange,
  tags,
  updateProject,
}: Readonly<GeneralSettingsContentProps>) {
  return (
    <div className="max-w-[640px] space-y-5" data-general-settings-content="">
      <div data-general-settings-settled-frame="project-details">
        <ProjectDetailsCard
          canEdit={canEditProject}
          initialDomainConfirmationOpen={initialDomainConfirmationOpen}
          project={project}
          requestDomainChange={requestDomainChange}
          updateProject={updateProject}
        />
      </div>
      <div data-general-settings-settled-frame="tags-segments">
        <TagsSegmentsCard
          canCreate={canCreateTags}
          canDelete={canDeleteTags}
          createTag={createTag}
          deleteTag={deleteTag}
          projectId={project.projectId}
          tags={tags}
        />
      </div>
    </div>
  );
}
