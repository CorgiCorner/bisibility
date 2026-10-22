"use client";

import { ActionNotice } from "@/components/integrations/ConnectDrawerControls";
import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import type { DisconnectProviderInput, ProviderActionHandlers } from "@/lib/integrations/types";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { type Notice, providerActionErrorNotice } from "./ConnectDrawerSchema";

type ProviderDisconnectActionProps = {
  disconnectProvider?: ProviderActionHandlers["disconnectProvider"];
  onDisconnected: () => void;
  renderTrigger?: (props: { disabled: boolean; onOpen: () => void }) => ReactNode;
  onNotice: (notice: Notice | null) => void;
  projectId: string;
  providerId: Parameters<ProviderActionHandlers["testProviderConnection"]>[0]["providerId"];
  keyRemoval?: DisconnectProviderInput["expectedConnection"] | null;
};

export function ProviderDisconnectAction({
  disconnectProvider,
  onDisconnected,
  onNotice,
  projectId,
  providerId,
  renderTrigger,
  keyRemoval,
}: Readonly<ProviderDisconnectActionProps>) {
  const t = useTranslations("projectIntegrations.provider");
  const drawerT = useTranslations("projectIntegrations.drawer");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failureNotice, setFailureNotice] = useState<Notice | null>(null);
  const { readOnly } = useProjectWriteMode();

  async function disconnect() {
    if (readOnly || !disconnectProvider || keyRemoval === null) return;

    setBusy(true);
    try {
      await disconnectProvider({
        projectId,
        providerId,
        ...(keyRemoval ? { expectedConnection: keyRemoval } : {}),
      });
      setFailureNotice(null);
      onNotice(null);
      setOpen(false);
      onDisconnected();
    } catch (error) {
      setFailureNotice(
        providerActionErrorNotice(error, {
          appUpdateRequired: drawerT("appUpdateRequired"),
          connectionTestFailed: drawerT("connectionTestFailed"),
          connectionTestPassed: drawerT("connectionTestPassed"),
          providerActionFailed: drawerT("providerActionFailed"),
          providerActionFailedMessage: drawerT("providerActionFailedMessage"),
        }),
      );
      throw error;
    } finally {
      setBusy(false);
    }
  }

  function openConfirmation() {
    if (readOnly || keyRemoval === null) return;
    setFailureNotice(null);
    onNotice(null);
    setOpen(true);
  }

  return (
    <>
      {renderTrigger ? (
        renderTrigger({ disabled: readOnly || keyRemoval === null, onOpen: openConfirmation })
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
            {t("disconnect")}
          </Button>
        </ProjectReadOnlyTooltip>
      )}
      <ConfirmModal
        busy={busy}
        confirmationDisabled={readOnly || keyRemoval === null || !disconnectProvider}
        failureDetail={failureNotice ? <ActionNotice notice={failureNotice} /> : undefined}
        kind={keyRemoval === undefined ? "removeIntegration" : "removeProviderKey"}
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
