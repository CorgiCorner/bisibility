"use client";

import { useProjectChainLabels } from "@/components/integrations/project-chain-labels";
import {
  ProviderUiProvider,
  useProviderUiStatus,
} from "@/components/provider-management/ProviderUiProvider";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import {
  type ProjectChainProps,
  type ProjectChainSnapshot,
  ProviderChainEditor,
  useProjectChainController,
} from "@/components/usagekit/provider-chain-editor";
import { ProviderReadFeedback } from "@/components/usagekit/provider-feedback";
import { recoverProjectChainSnapshot } from "@/components/usagekit/provider-project-controller";
import {
  executeProviderUiAction,
  getProviderUiBindingAction,
  readProviderUiAction,
  reconcileProviderUiAction,
} from "@/lib/actions/provider-ui";
import type { IntegrationProviderData } from "@/lib/integrations/types";
import { compareProviderChainEntries } from "@/lib/rank-check/provider-chain-order";
import { useQuery } from "@tanstack/react-query";
import {
  type SharedProviderManagementBinding,
  useProviderManagementBinding,
} from "@usagekit/react";
import type { ProviderBinding } from "@usagekit/views";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  projectId: string;
  providers: readonly IntegrationProviderData[];
  canManageProviders: boolean;
};
const identity = (binding: ProviderBinding) =>
  JSON.stringify([binding.scopeKey, binding.principalKey, binding.authRevision]);
// An unfinished command belongs to its project and principal even when authorization changes.
// Fresh bindings still gate reads and writes; this identity only recovers the original command.
const journalIdentity = (binding: ProviderBinding) =>
  JSON.stringify([binding.scopeKey, binding.principalKey]);
class ChainReadProblem extends Error {
  constructor(readonly state: "forbidden" | "unavailable") {
    super(state);
  }
}

function ChainSurface({ readState, ...props }: ProjectChainProps & { readState: string }) {
  // The shared controller also handles Reload from the host's read-error surface.
  const controller = useProjectChainController(props);
  const showRead =
    readState !== "ok" &&
    !controller.pending &&
    !controller.ambiguous &&
    controller.result?.outcome !== "success";
  return (
    <>
      {showRead && (
        <ProviderReadFeedback
          state={readState}
          labels={props.feedbackLabels}
          disabled={controller.pending || controller.ambiguous}
          refresh={() => void controller.reload()}
        />
      )}
      {!showRead && <ProviderChainEditor {...props} />}
    </>
  );
}

function BoundChain({ binding, ...props }: Props & { binding: SharedProviderManagementBinding }) {
  const status = useProviderUiStatus();
  const { readOnly } = useProjectWriteMode();
  const copy = useProjectChainLabels();
  const router = useRouter();
  const scope = identity(binding.binding);
  const journalScope = journalIdentity(binding.binding);
  const [accessState, setAccessState] = useState<"ready" | "forbidden" | "unavailable">("ready");
  const query = useQuery({
    queryKey: ["serp-project-chain", props.projectId, scope],
    enabled: status.state === "ready",
    retry: false,
    queryFn: async (): Promise<ProjectChainSnapshot> => {
      const result = await readProviderUiAction(props.projectId, { kind: "connections" });
      if (result.outcome !== "ok")
        throw new ChainReadProblem(result.outcome === "forbidden" ? "forbidden" : "unavailable");
      if (result.value.kind !== "connections" || !["ok", "empty"].includes(result.value.state))
        throw new ChainReadProblem(
          result.value.state === "forbidden" ? "forbidden" : "unavailable",
        );
      const providers = new Map(
        props.providers.filter((row) => row.kind === "serp").map((row) => [row.id, row]),
      );
      const connections = result.value.connections
        .filter((row) => row.status.state === "connected" && providers.has(row.provider))
        .sort(
          (a, b) =>
            Number(b.enabled) - Number(a.enabled) ||
            compareProviderChainEntries(
              { priority: a.priority ?? 1000, provider: a.provider },
              { priority: b.priority ?? 1000, provider: b.provider },
            ),
        );
      return {
        identity: journalScope,
        revision: result.value.revision,
        entries: connections.map((row) => ({
          id: row.id,
          label: providers.get(row.provider)?.name ?? row.label,
          enabled: row.enabled,
          revision: row.revision,
        })),
      };
    },
  });
  const [snapshot, setSnapshot] = useState<ProjectChainSnapshot | null>(() =>
    recoverProjectChainSnapshot(journalScope),
  );
  if (!snapshot && query.data) setSnapshot(query.data);
  const readState =
    status.state !== "ready"
      ? status.state
      : accessState !== "ready"
        ? accessState
        : query.isError
          ? query.error instanceof ChainReadProblem
            ? query.error.state
            : "unavailable"
          : !query.data
            ? "loading"
            : "ok";
  const reload = async () => {
    try {
      const nextBinding = await getProviderUiBindingAction(props.projectId);
      if (
        !nextBinding ||
        identity(nextBinding) !== scope ||
        nextBinding.canManage !== binding.binding.canManage
      ) {
        setAccessState("forbidden");
        status.refresh();
        return null;
      }
      const result = await query.refetch();
      setAccessState("ready");
      return result.isError ? null : (result.data ?? null);
    } catch {
      setAccessState("unavailable");
      return null;
    }
  };
  if (!snapshot)
    return (
      <ProviderReadFeedback
        state={readState}
        labels={copy.feedbackLabels}
        refresh={() => {
          void reload();
        }}
      />
    );
  if (!snapshot.entries.length && !query.data?.entries.length)
    return (
      <ProviderReadFeedback
        state={readState === "ok" ? "empty" : readState}
        labels={copy.feedbackLabels}
        refresh={() => {
          void reload().then((next) => {
            if (next) setSnapshot(next);
          });
        }}
      />
    );
  return (
    <ChainSurface
      {...copy}
      mode="project"
      snapshot={snapshot}
      readState={readState}
      evidence={readState === "ok" ? (query.data ?? null) : null}
      showControls={props.canManageProviders && (readOnly || status.managementAllowed === true)}
      canEdit={
        props.canManageProviders &&
        binding.binding.canManage === true &&
        !readOnly &&
        readState === "ok" &&
        !query.isFetching
      }
      onCommit={(command) =>
        executeProviderUiAction(props.projectId, { kind: "project_chain", ...command })
      }
      onReconcile={(command) =>
        reconcileProviderUiAction(props.projectId, { kind: "project_chain", ...command })
      }
      onReload={reload}
      onSaved={() => router.refresh()}
    />
  );
}

function VerifiedChain(props: Props) {
  const binding = useProviderManagementBinding();
  const status = useProviderUiStatus();
  const copy = useProjectChainLabels();
  if (!binding)
    return (
      <ProviderReadFeedback
        state={status.state}
        labels={copy.feedbackLabels}
        refresh={status.refresh}
      />
    );
  return <BoundChain key={identity(binding.binding)} {...props} binding={binding} />;
}

export function ProjectSerpChain(props: Props) {
  return (
    <ProviderUiProvider projectId={props.projectId}>
      <VerifiedChain {...props} />
    </ProviderUiProvider>
  );
}
