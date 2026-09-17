"use client";

import { AdvancedCardFrame } from "@/components/settings/advanced/AdvancedCardFrame";
import { advancedCardGeometryClassNames } from "@/components/settings/advanced/advanced-settings-layout";
import {
  type DeleteProjectAction,
  DeleteProjectConfirmation,
} from "@/components/settings/advanced/DeleteProjectConfirmation";
import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";
import { useState } from "react";

export type { DeleteProjectAction } from "@/components/settings/advanced/DeleteProjectConfirmation";

type DeleteProjectCardProps = {
  deleteProject: DeleteProjectAction;
  domain: string;
  projectId: string;
};

export function DeleteProjectCard({
  deleteProject,
  domain,
  projectId,
}: Readonly<DeleteProjectCardProps>) {
  const t = useTranslations("projectSettingsAdvanced.danger");
  const [confirmationOpen, setConfirmationOpen] = useState(false);

  return (
    <>
      <AdvancedCardFrame
        className={advancedCardGeometryClassNames.danger}
        description={t("description")}
        footer={
          <Button
            aria-haspopup="dialog"
            onClick={() => setConfirmationOpen(true)}
            type="button"
            variant="destructive"
          >
            {t("delete")}
          </Button>
        }
        id="danger"
        title={t("title")}
        tone="danger"
      >
        {null}
      </AdvancedCardFrame>
      <DeleteProjectConfirmation
        deleteProject={deleteProject}
        domain={domain}
        onClose={() => setConfirmationOpen(false)}
        open={confirmationOpen}
        projectId={projectId}
      />
    </>
  );
}
