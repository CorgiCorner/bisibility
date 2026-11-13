"use client";
import {
  commitRecoveryAction,
  getRecoveryCommandAction,
  previewRecoveryAction,
} from "@/lib/actions/metering-recovery";
import type {
  RecoveryCase,
  RecoveryCommandResult,
  RecoveryPreview,
  RecoveryUiError,
} from "@/lib/metering/recovery/contract";
import { MAX_RECOVERY_BATCH, recoveryPreviewInputSchema } from "@/lib/metering/recovery/input";
import { QueryClient, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { z } from "zod";
export type RecoveryRoute = {
  batch: string | null;
  command: string | null;
  update: (values: Record<string, string | undefined>) => void;
};
/**
 * The batch is kept as case references. Sealed tokens made the URL about 9 KB for a full batch,
 * above the request line some proxies accept, and a token of an earlier read is not needed: the
 * loaded cases carry the current one.
 */
const batchReferences = z.array(z.string().min(1).max(128)).min(1).max(MAX_RECOVERY_BATCH);
export function useRecoveryBatch(
  route?: RecoveryRoute,
  cases: readonly Pick<RecoveryCase, "reference" | "token">[] = [],
) {
  const t = useTranslations("instanceAdmin.recovery");
  const [busy, start] = useTransition();
  const [client] = useState(() => new QueryClient());
  const [localBatch, setLocalBatch] = useState<string | null>(null);
  const [localCommandId, setLocalCommandId] = useState<string | null>(null);
  const [localCommand, setLocalCommand] = useState<RecoveryCommandResult | null>(null);
  const [batchErrorCode, setBatchError] = useState<RecoveryUiError>();
  const batchError = batchErrorCode ? t(`errors.${batchErrorCode}`) : undefined;
  const [commandError, setCommandError] = useState<string>();
  const commandId = useRef<string | null>(null);
  const batch = route ? route.batch : localBatch;
  function options(value: string | null) {
    return {
      queryKey: ["admin-recovery-preview", value],
      retry: false as const,
      staleTime: 0,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      queryFn: async () => {
        const references = batchReferences.parse(JSON.parse(value ?? "[]"));
        // A case that is no longer loaded has no current token and cannot be authorized.
        const parsed = recoveryPreviewInputSchema.parse({
          caseTokens: references.flatMap(
            (reference) => cases.find((item) => item.reference === reference)?.token ?? [],
          ),
        });
        const result = await previewRecoveryAction(parsed);
        return { result, commandId: crypto.randomUUID() };
      },
    };
  }
  const prepared = useQuery({ ...options(batch), enabled: !!batch }, client);
  const trackedCommandId = route ? route.command : localCommandId;
  const commandQuery = useQuery(
    {
      queryKey: ["admin-recovery-command", trackedCommandId],
      queryFn: () => getRecoveryCommandAction(trackedCommandId ?? ""),
      enabled: !!trackedCommandId,
      retry: false,
      refetchInterval: (query) => {
        const data = query.state.data;
        return (data?.ok && ["completed", "failed"].includes(data.value.state)) ||
          (data?.ok === false && (data.code === "forbidden" || query.state.dataUpdateCount >= 10))
          ? false
          : 3000;
      },
    },
    client,
  );
  const previewResult = prepared.data?.result;
  const preview = !trackedCommandId && previewResult?.ok ? previewResult.value : null;
  const commandResult = commandQuery.data;
  async function readCommand() {
    if (!commandId.current) return;
    try {
      const result = await getRecoveryCommandAction(commandId.current);
      client.setQueryData(["admin-recovery-command", commandId.current], result);
      if (result.ok) {
        setLocalCommand(result.value);
        setCommandError(undefined);
      } else setCommandError(t(`errors.${result.code}`));
    } catch {
      setCommandError(t("errors.unavailable"));
    }
  }
  return {
    busy: busy || prepared.isFetching || commandQuery.isFetching,
    preview,
    command: commandResult?.ok ? commandResult.value : localCommand,
    batchErrorCode:
      batchErrorCode ??
      (prepared.isError
        ? "unavailable"
        : previewResult && !previewResult.ok
          ? previewResult.code
          : undefined),
    batchError:
      batchError ??
      (prepared.isError
        ? t("errors.unavailable")
        : previewResult && !previewResult.ok
          ? t(`errors.${previewResult.code}`)
          : undefined),
    commandError:
      commandError ??
      (commandQuery.isError
        ? t("errors.unavailable")
        : commandResult && !commandResult.ok
          ? t(`errors.${commandResult.code}`)
          : undefined),
    onClearPreview: () => {
      setLocalBatch(null);
      route?.update({ batch: undefined });
    },
    onPreview: (references: string[]) =>
      start(async () => {
        const current = commandResult?.ok ? commandResult.value : localCommand;
        if (
          (route?.command || commandId.current) &&
          (!current || !["completed", "failed"].includes(current.state))
        )
          return;
        commandId.current = null;
        setLocalCommandId(null);
        setLocalCommand(null);
        setCommandError(undefined);
        const value = JSON.stringify(references);
        setBatchError(undefined);
        setLocalBatch(value);
        route?.update({ batch: value, command: undefined });
        try {
          await client.fetchQuery(options(value));
        } catch {
          setBatchError("unavailable");
        }
      }),
    onConfirm: async (value: RecoveryPreview) => {
      if (!prepared.data || !preview || value.token !== preview.token) return false;
      if (route?.command || localCommand) return false;
      const attemptedCommandId = prepared.data.commandId;
      commandId.current = attemptedCommandId;
      setLocalCommandId(commandId.current);
      // Persist before dispatch: a response loss must not lose the attempted identity.
      route?.update({ command: attemptedCommandId });
      try {
        const result = await commitRecoveryAction({
          previewToken: value.token,
          commandId: commandId.current,
        });
        if (!result.ok) {
          setBatchError(result.code);
          if (result.code === "unavailable") {
            setCommandError(t("errors.unavailable"));
            route?.update({ command: attemptedCommandId });
            await readCommand();
          } else {
            commandId.current = null;
            setLocalCommandId(null);
            setLocalBatch(null);
            client.removeQueries({ queryKey: ["admin-recovery-preview", batch] });
            route?.update({ batch: undefined, command: undefined });
          }
          return false;
        }
        setLocalCommand(result.value);
        setBatchError(undefined);
        setLocalBatch(null);
        route?.update({ batch: undefined, command: commandId.current });
        await readCommand();
        return true;
      } catch {
        setBatchError("unavailable");
        setCommandError(t("errors.unavailable"));
        route?.update({ command: attemptedCommandId });
        await readCommand();
        return false;
      }
    },
    onRetryCommand: () =>
      start(async () => {
        if (route?.command) await commandQuery.refetch();
        else await readCommand();
      }),
  };
}
