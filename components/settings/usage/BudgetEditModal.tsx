"use client";

import { ProviderAllocationDialog } from "@/components/provider-management/ProviderAllocationDialog";
import { ProviderUiProvider } from "@/components/provider-management/ProviderUiProvider";
import type { UsageConnection } from "@/lib/metering/user-views";
import { useOverlayFocus } from "@/lib/ui/use-overlay-focus";
import type { ProviderAllocationRow } from "@usagekit/views";
import { useRef } from "react";

type BudgetEditModalProps = {
  connections: readonly UsageConnection[];
  surface?: ProviderAllocationRow["surface"];
  onClose: () => void;
  onSaved: () => void;
  projectId: string;
  projectRef: string;
};

export function BudgetEditModal({
  connections,
  surface,
  onClose,
  onSaved,
  projectId,
  projectRef,
}: Readonly<BudgetEditModalProps>) {
  const opener = useOverlayFocus(true);
  const dismissed = useRef(false);
  function dismiss(callback: () => void) {
    dismissed.current = true;
    callback();
  }
  function restoreOpener() {
    if (dismissed.current && opener.current?.isConnected) opener.current.focus();
  }
  return (
    <ProviderUiProvider projectId={projectId}>
      <ProviderAllocationDialog
        connections={connections}
        surface={surface}
        key={JSON.stringify([connections.map((item) => item.connectionId), surface])}
        onClose={() => dismiss(onClose)}
        onSaved={() => dismiss(onSaved)}
        onExited={restoreOpener}
        projectRef={projectRef}
      />
    </ProviderUiProvider>
  );
}
