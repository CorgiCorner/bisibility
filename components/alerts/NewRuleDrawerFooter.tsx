"use client";

import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { Button } from "@/components/ui/Button";
import { BellRingingIcon as BellRinging } from "@phosphor-icons/react/dist/csr/BellRinging";
import { useTranslations } from "next-intl";

type NewRuleDrawerFooterProps = {
  isEdit: boolean;
  isSubmitting: boolean;
  onSubmitWithEnabled: (enabled: boolean) => void;
  readOnly: boolean;
};

export function NewRuleDrawerFooter({
  isEdit,
  isSubmitting,
  onSubmitWithEnabled,
  readOnly,
}: Readonly<NewRuleDrawerFooterProps>) {
  const t = useTranslations("projectAlerts.drawer");

  return (
    <div className="flex items-center gap-2.5">
      <ProjectReadOnlyTooltip>
        <Button
          className="shrink-0"
          disabled={readOnly || isSubmitting}
          onClick={() => onSubmitWithEnabled(false)}
          size="md"
          type="button"
          variant="secondary"
        >
          {isEdit ? t("savePaused") : t("createPaused")}
        </Button>
      </ProjectReadOnlyTooltip>
      <ProjectReadOnlyTooltip className="inline-flex flex-1">
        <Button
          className="flex-1"
          disabled={readOnly || isSubmitting}
          onClick={() => onSubmitWithEnabled(true)}
          size="md"
          startIcon={<BellRinging aria-hidden size={14} weight="regular" />}
          type="button"
        >
          {isEdit ? t("saveRule") : t("createRule")}
        </Button>
      </ProjectReadOnlyTooltip>
    </div>
  );
}
