"use client";

import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Card } from "@/components/ui/Card";
import type { IntegrationProviderData, ProviderActionHandlers } from "@/lib/integrations/types";
import type { ProjectRef } from "@/lib/routing/app-path";
import { ProviderConsumerRows } from "./ProviderConsumerRows";
import { providerConsumerStatuses } from "./provider-card-config";
import { useProviderTrafficSync } from "./useProviderTrafficSync";

export function ProviderConsumerPanel({
  actions,
  canUpdateProject,
  projectId,
  projectRef,
  provider,
  timeZone,
}: Readonly<{
  actions?: ProviderActionHandlers;
  canUpdateProject: boolean;
  projectId?: string;
  projectRef?: ProjectRef;
  provider: IntegrationProviderData;
  timeZone: string;
}>) {
  const { readOnly } = useProjectWriteMode();
  const { handleTrafficSync, syncPending, syncResult } = useProviderTrafficSync({
    projectId,
    readOnly,
    syncProjectTraffic: actions?.syncProjectTraffic,
  });
  const statuses = providerConsumerStatuses(provider);
  if (!statuses) return null;
  return (
    <Card aria-label={`${provider.name} activity`} component="section" className="min-w-0 p-4">
      <ProviderConsumerRows
        canSync={canUpdateProject && provider.status === "connected" && provider.enabled !== false}
        layout="columns"
        onSync={() => void handleTrafficSync()}
        projectRef={projectRef}
        readOnly={readOnly}
        statuses={statuses}
        syncFailure={provider.syncFailure}
        syncPending={syncPending}
        syncResult={syncResult}
        timeZone={timeZone}
      />
    </Card>
  );
}
