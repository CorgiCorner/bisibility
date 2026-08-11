"use client";

import { AdvancedCardFrame } from "@/components/settings/advanced/AdvancedCardFrame";
import { advancedCardGeometryClassNames } from "@/components/settings/advanced/advanced-settings-layout";
import {
  type DeleteProjectAction,
  DeleteProjectConfirmation,
} from "@/components/settings/advanced/DeleteProjectConfirmation";
import { Button } from "@/components/ui";
import { TrashIcon as Trash } from "@phosphor-icons/react";
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
  const [confirmationOpen, setConfirmationOpen] = useState(false);

  return (
    <>
      <AdvancedCardFrame
        className={advancedCardGeometryClassNames.danger}
        description="Permanently delete this project, its tracked data and project API keys. This cannot be undone."
        footer={
          <Button
            aria-haspopup="dialog"
            onClick={() => setConfirmationOpen(true)}
            startIcon={<Trash aria-hidden size={14} weight="bold" />}
            type="button"
            variant="destructive"
          >
            Delete project
          </Button>
        }
        id="danger"
        title="Danger zone"
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
