"use client";

import { ActionNotice } from "@/components/integrations/ConnectDrawerControls";
import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button, ConfirmModal } from "@/components/ui";
import type { ProviderActionHandlers } from "@/lib/integrations/types";
import { useState } from "react";
import { type Notice, providerActionErrorNotice } from "./ConnectDrawerSchema";

type ProviderDisconnectActionProps = {
  disconnectProvider?: ProviderActionHandlers["disconnectProvider"];
  onDisconnected: () => void;
  onNotice: (notice: Notice | null) => void;
  projectId: string;
  providerId: Parameters<ProviderActionHandlers["testProviderConnection"]>[0]["providerId"];
};

export function ProviderDisconnectAction({
  disconnectProvider,
  onDisconnected,
  onNotice,
  projectId,
  providerId,
}: Readonly<ProviderDisconnectActionProps>) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failureNotice, setFailureNotice] = useState<Notice | null>(null);
  const { readOnly } = useProjectWriteMode();

  async function disconnect() {
    if (readOnly || !disconnectProvider) return;

    setBusy(true);
    try {
      await disconnectProvider({ projectId, providerId });
      setFailureNotice(null);
      onNotice(null);
      setOpen(false);
      onDisconnected();
    } catch (error) {
      setFailureNotice(providerActionErrorNotice(error));
      throw error;
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ProjectReadOnlyTooltip className="flex flex-1 sm:inline-flex sm:flex-initial">
        <Button
          disabled={readOnly}
          onClick={() => {
            setFailureNotice(null);
            onNotice(null);
            setOpen(true);
          }}
          size="xs"
          sx={{
            color: "var(--red)",
            width: "100%",
            "&:hover": { color: "var(--red)" },
            "@media (min-width:640px)": { width: "auto" },
          }}
          type="button"
          variant="ghost"
        >
          Disconnect
        </Button>
      </ProjectReadOnlyTooltip>
      <ConfirmModal
        busy={busy}
        failureDetail={failureNotice ? <ActionNotice notice={failureNotice} /> : undefined}
        kind="removeIntegration"
        onClose={() => {
          setOpen(false);
          onNotice(failureNotice);
        }}
        onConfirm={disconnect}
        open={open}
      />
    </>
  );
}
