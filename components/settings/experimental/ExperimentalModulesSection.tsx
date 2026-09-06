import {
  ExperimentalModulesForm,
  type UpdateExperimentalModules,
} from "@/components/settings/experimental/ExperimentalModulesForm";
import { setExperimentalModules } from "@/lib/actions/experimental-modules";
import type { ExperimentalModuleKey } from "@/lib/settings/experimental-modules";

type ExperimentalModulesSectionProps = {
  canEdit: boolean;
  enabledExperimentalModules: readonly ExperimentalModuleKey[];
  projectId: string;
  updateExperimentalModules?: UpdateExperimentalModules;
};

export function ExperimentalModulesSection({
  canEdit,
  enabledExperimentalModules,
  projectId,
  updateExperimentalModules = setExperimentalModules,
}: Readonly<ExperimentalModulesSectionProps>) {
  return (
    <ExperimentalModulesForm
      canEdit={canEdit}
      enabledExperimentalModules={enabledExperimentalModules}
      projectId={projectId}
      updateExperimentalModules={updateExperimentalModules}
    />
  );
}
