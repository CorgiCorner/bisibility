import { SampleDataButton } from "@/components/sample-data/SampleDataButton";
import { useTranslations } from "next-intl";
import { CloudImportWorkspaceButton } from "./CloudImportWorkspaceButton";
import type { OnboardingWizardActions } from "./onboarding-wizard-actions";

export function OnboardingProjectOptions({
  action,
}: Readonly<{ action: OnboardingWizardActions["installSampleDataAction"] }>) {
  const t = useTranslations("onboarding.projectOptions");
  return (
    <div className="flex flex-wrap items-end gap-x-3">
      {action ? (
        <SampleDataButton
          action={action}
          help={t("sampleHelp")}
          label={t("sampleProject")}
          size="lg"
          variant="secondary"
        />
      ) : null}
      <CloudImportWorkspaceButton />
    </div>
  );
}
