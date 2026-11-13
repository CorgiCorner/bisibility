"use client";

import type { DomainChangeRequest } from "@/components/settings/general/DomainChangeConfirmation";
import {
  type GeneralProjectDetails,
  ProjectDetailsCard,
  type UpdateProjectDetails,
} from "@/components/settings/general/ProjectDetailsCard";

export type GeneralSettingsContentProps = {
  canEditProject: boolean;
  initialDomainConfirmationOpen?: boolean;
  project: GeneralProjectDetails;
  requestDomainChange: (request: DomainChangeRequest) => Promise<unknown>;
  updateProject: UpdateProjectDetails;
};

export function GeneralSettingsContent({
  canEditProject,
  initialDomainConfirmationOpen,
  project,
  requestDomainChange,
  updateProject,
}: Readonly<GeneralSettingsContentProps>) {
  return (
    <div className="w-full space-y-5 lg:max-w-[640px]" data-general-settings-content="">
      <div data-general-settings-settled-frame="project-details">
        <ProjectDetailsCard
          canEdit={canEditProject}
          initialDomainConfirmationOpen={initialDomainConfirmationOpen}
          project={project}
          requestDomainChange={requestDomainChange}
          updateProject={updateProject}
        />
      </div>
    </div>
  );
}
