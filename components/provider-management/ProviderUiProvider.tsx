"use client";

import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import {
  executeProviderUiAction,
  getProviderUiBindingAction,
  readProviderUiAction,
  reconcileProviderUiAction,
} from "@/lib/actions/provider-ui";
import { authClient } from "@/lib/auth/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createProviderQueryClient, ProviderManagementProvider } from "@usagekit/react";
import type { ProviderManagementPort } from "@usagekit/views";
import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

type ProviderUiStatus = {
  projectId?: string;
  state: "loading" | "ready" | "forbidden" | "unavailable";
  managementAllowed?: boolean;
  refresh: () => void;
};

const StatusContext = createContext<ProviderUiStatus>({ state: "loading", refresh() {} });

export function useProviderUiStatus() {
  return useContext(StatusContext);
}

function VerifiedProviderUi({ projectId, children }: { projectId: string; children: ReactNode }) {
  const [providerClient] = useState(() => createProviderQueryClient());
  const session = authClient.useSession();
  const { readOnly, writeMode } = useProjectWriteMode();
  const enabled = !session.isPending && !!session.data;
  const identity = [session.data?.user.id, session.data?.session.id, session.data?.user.updatedAt];
  const query = useQuery({
    queryKey: ["provider-ui-binding", projectId, ...identity, writeMode],
    queryFn: () => {
      providerClient.invalidate();
      return getProviderUiBindingAction(projectId);
    },
    enabled,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const port = useMemo<ProviderManagementPort>(
    () => ({
      read: (_binding, input) => readProviderUiAction(projectId, input),
      execute: (_binding, command, secrets) =>
        secrets
          ? Promise.resolve({
              outcome: "invalid",
              commandId: command.commandId,
              field: "credentials",
              reason: "Unsupported",
            })
          : executeProviderUiAction(projectId, command),
      reconcile: (_binding, command) => reconcileProviderUiAction(projectId, command),
    }),
    [projectId],
  );
  const state =
    session.isPending || (enabled && query.isPending)
      ? "loading"
      : !enabled || query.data === null
        ? "forbidden"
        : query.isError
          ? "unavailable"
          : "ready";
  const status = {
    projectId,
    state,
    managementAllowed: query.data?.canManage === true,
    refresh: () => {
      void query.refetch();
    },
  } as const;
  const binding =
    (state === "ready" || state === "unavailable") && query.data
      ? {
          ...query.data,
          canManage:
            state === "ready" && query.data.canManage === true && !readOnly && !query.isFetching,
        }
      : null;
  return (
    <StatusContext.Provider value={status}>
      {binding ? (
        <ProviderManagementProvider
          binding={binding}
          client={providerClient}
          key={JSON.stringify([...identity, writeMode, binding.authRevision])}
          port={port}
        >
          {children}
        </ProviderManagementProvider>
      ) : (
        children
      )}
    </StatusContext.Provider>
  );
}

export function ProviderUiProvider({
  projectId,
  children,
}: Readonly<{ projectId: string; children: ReactNode }>) {
  const inherited = useProviderUiStatus();
  const [client] = useState(() => new QueryClient());
  if (inherited.projectId === projectId) return children;
  return (
    <QueryClientProvider client={client}>
      <VerifiedProviderUi key={projectId} projectId={projectId}>
        {children}
      </VerifiedProviderUi>
    </QueryClientProvider>
  );
}
