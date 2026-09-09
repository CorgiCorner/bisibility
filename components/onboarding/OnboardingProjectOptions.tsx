import {
  SAMPLE_DATA_BUTTON_TOOLTIP,
  SampleDataButton,
} from "@/components/sample-data/SampleDataButton";
import { CloudImportWorkspaceButton } from "./CloudImportWorkspaceButton";
import type { OnboardingWizardActions } from "./onboarding-wizard-actions";

export function OnboardingProjectOptions({
  action,
}: Readonly<{ action: OnboardingWizardActions["installSampleDataAction"] }>) {
  return (
    <div className="flex flex-wrap items-end gap-x-3">
      {action ? (
        <SampleDataButton
          action={action}
          help={SAMPLE_DATA_BUTTON_TOOLTIP}
          label="Load sample project"
          size="lg"
          variant="secondary"
        />
      ) : null}
      <CloudImportWorkspaceButton />
    </div>
  );
}
