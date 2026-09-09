"use client";

import { ActionNotice } from "@/components/integrations/ConnectDrawerControls";
import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import type { ProviderActionHandlers } from "@/lib/integrations/types";
import { type ReactNode, useState } from "react";
import { type Notice, providerActionErrorNotice } from "./ConnectDrawerSchema";

type ProviderDisconnectActionProps = {
  disconnectProvider?: ProviderActionHandlers["disconnectProvider"];
  onDisconnected: () => void;
  renderTrigger?: (props: { disabled: boolean; onOpen: () => void }) => ReactNode;
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
  renderTrigger,
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

  function openConfirmation() {
    if (readOnly) return;
    setFailureNotice(null);
    onNotice(null);
    setOpen(true);
  }

  return (
    <>
      {renderTrigger ? (
        renderTrigger({ disabled: readOnly, onOpen: openConfirmation })
      ) : (
        <ProjectReadOnlyTooltip className="inline-flex">
          <Button
            disabled={readOnly}
            onClick={openConfirmation}
            size="xs"
            style={{
              "--control-color": "var(--red)",
              "--control-hover-color": "var(--red)",
            }}
            type="button"
            variant="ghost"
          >
            Disconnect
          </Button>
        </ProjectReadOnlyTooltip>
      )}
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
