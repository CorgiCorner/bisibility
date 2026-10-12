"use server";
import { AuthorizationError } from "@/lib/auth/authorize";
import { providerUiService } from "@/lib/provider-ui/service";
import type {
  ProviderActionResult,
  ProviderBinding,
  ProviderReadResult,
  ProviderReconciliation,
} from "@usagekit/views";
import { unstable_rethrow } from "next/navigation";
import { getActionActor, ProjectNotFoundError, requireProjectScope } from "./_shared";

async function scope(projectId: string, action: "read" | "manage" = "read") {
  const actor = await getActionActor();
  await requireProjectScope(
    actor,
    action,
    projectId,
    { type: "provider_connection" },
    { allowReadOnly: true },
  );
  return { actor, projectPublicId: projectId };
}

export async function getProviderUiBindingAction(
  projectId: string,
): Promise<ProviderBinding | null> {
  try {
    return await providerUiService.binding(await scope(projectId));
  } catch (error) {
    if (denied(error)) return null;
    throw new Error("Provider settings could not be confirmed.");
  }
}
export async function readProviderUiAction(
  projectId: string,
  query: unknown,
): Promise<ProviderReadResult> {
  try {
    return await providerUiService.read(await scope(projectId), query);
  } catch (error) {
    return denied(error)
      ? { outcome: "forbidden" }
      : { outcome: "unavailable", message: "Stored provider data is unavailable." };
  }
}
export async function executeProviderUiAction(
  projectId: string,
  command: unknown,
): Promise<ProviderActionResult> {
  try {
    return await providerUiService.execute(await scope(projectId, "manage"), command);
  } catch (error) {
    return commandFailure(error, command);
  }
}
export async function reconcileProviderUiAction(
  projectId: string,
  command: unknown,
): Promise<ProviderReconciliation> {
  try {
    return await providerUiService.reconcile(await scope(projectId), command);
  } catch (error) {
    return commandFailure(error, command);
  }
}

function denied(error: unknown) {
  unstable_rethrow(error);
  return error instanceof AuthorizationError || error instanceof ProjectNotFoundError;
}

function commandFailure(error: unknown, command: unknown): ProviderActionResult {
  return denied(error)
    ? { outcome: "forbidden", commandId: nonce(command) }
    : {
        outcome: "unavailable",
        commandId: nonce(command),
        ambiguous: true,
        message: "Command status is unavailable. Reconcile the original command.",
      };
}

function nonce(raw: unknown) {
  return raw &&
    typeof raw === "object" &&
    "commandId" in raw &&
    typeof raw.commandId === "string" &&
    /^[A-Za-z0-9_-]{8,128}$/.test(raw.commandId)
    ? raw.commandId
    : "invalid-command";
}
