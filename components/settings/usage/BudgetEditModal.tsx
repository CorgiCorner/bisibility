"use client";

import { ProviderAllocationDialog } from "@/components/provider-management/ProviderAllocationDialog";
import { ProviderUiProvider } from "@/components/provider-management/ProviderUiProvider";
import type { UsageConnection } from "@/lib/metering/user-views";
import { useOverlayFocus } from "@/lib/ui/use-overlay-focus";
import { useRef } from "react";

type BudgetEditModalProps = {
  connections: readonly UsageConnection[];
  onClose: () => void;
  onSaved: () => void;
  projectId: string;
  projectRef: string;
};

export function BudgetEditModal({
  connections,
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
        key={JSON.stringify(connections.map((item) => item.connectionId))}
        onClose={() => dismiss(onClose)}
        onSaved={() => dismiss(onSaved)}
        onExited={restoreOpener}
        projectRef={projectRef}
      />
    </ProviderUiProvider>
  );
}
