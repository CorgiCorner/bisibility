import { GeneralSettingsContent } from "@/components/settings/general/GeneralSettingsContent";
import type { GeneralProjectDetails } from "@/components/settings/general/ProjectDetailsCard";
import { confirmProjectDomainChange } from "@/lib/actions/project-domain-change";
import { updateProjectDetails } from "@/lib/actions/settings";

type GeneralSettingsSectionProps = {
  canEditProject: boolean;
  project: GeneralProjectDetails;
};

export function GeneralSettingsSection({
  canEditProject,
  project,
}: Readonly<GeneralSettingsSectionProps>) {
  return (
    <GeneralSettingsContent
      canEditProject={canEditProject}
      key={JSON.stringify(project)}
      project={project}
      requestDomainChange={confirmProjectDomainChange}
      updateProject={updateProjectDetails}
    />
  );
}
