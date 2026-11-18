import "server-only";
import "@/lib/providers/model/server-registration";
import { modelCatalogSnapshotSchema } from "@/lib/model-playground/schema";
import { modelAccountDigest } from "@/lib/providers/model/account-scope";
import { WORKSPACE_MESSAGES } from "@/lib/providers/model/errors";
import { getModelProvider } from "@/lib/providers/model/registry";
import { NATIVE_MODEL_PROVIDERS } from "@/lib/providers/model/types";
import { consumeProviderLimit } from "@/lib/providers/rate-limit";
import type { ProviderCredentials } from "@/lib/providers/types";
import { z } from "zod";
import type { ProviderProbeResult } from "./provider-verification";

const providerIdSchema = z.enum(NATIVE_MODEL_PROVIDERS);
const unavailable = { ok: false, message: "Model provider is not available yet." } as const;

/** Only fixed messages leave this boundary, including failures in loaders and quota checks. */
export async function probeModelProviderConnection(
  providerId: string,
  credentials: ProviderCredentials,
  projectId: string,
  selection?: { workspaceId: string },
): Promise<ProviderProbeResult> {
  try {
    if (Object.keys(credentials).some((field) => field !== "apiKey"))
      return { ok: false, message: "Model providers accept an API key only." };
    const apiKey = credentials.apiKey;
    if (!apiKey?.trim())
      return { ok: false, message: "Model provider requires an API key credential." };
    const parsed = providerIdSchema.safeParse(providerId);
    if (!parsed.success) return unavailable;
    const signal = AbortSignal.timeout(15_000);
    const adapter = await getModelProvider(parsed.data, signal);
    if (!adapter) return unavailable;
    const gate = await consumeProviderLimit(providerId, credentials, { projectId });
    if (!gate.success)
      return { ok: false, message: "Rate limited, try again shortly.", rateLimited: true };
    const workspaceId = selection?.workspaceId;
    const accountDigest = modelAccountDigest(parsed.data, apiKey, workspaceId);
    let onAbort = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new Error("Model provider connection test failed."));
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    const result = await Promise.race([
      Promise.resolve().then(() =>
        adapter.probe({
          apiKey,
          accountDigest,
          signal,
          ...(workspaceId !== undefined ? { workspaceId } : {}),
        }),
      ),
      aborted,
    ]).finally(() => signal.removeEventListener("abort", onAbort));
    signal.throwIfAborted();
    switch (result.state) {
      case "catalog_available": {
        const catalog = modelCatalogSnapshotSchema.safeParse(result.catalog);
        if (
          !catalog.success ||
          catalog.data.providerId !== parsed.data ||
          catalog.data.accountDigest !== accountDigest ||
          catalog.data.workspaceId !== workspaceId
        )
          return { ok: false, message: "Model provider connection test failed." };
        if (catalog.data.models.length === 0)
          return { ok: false, message: "No supported text models are available." };
        return {
          ok: true,
          message:
            catalog.data.recognition?.recognition === "partial"
              ? "Model provider metadata access verified. Some unrelated catalog entries were not recognized. Billed by your provider."
              : "Model provider metadata access verified. Billed by your provider.",
        };
      }
      case "invalid_key":
        return { ok: false, message: "Model credentials were rejected." };
      case "no_supported_models":
        return { ok: false, message: "No supported text models are available." };
      case "unavailable":
        return parsed.data === "anthropic" && result.workspaceIssue
          ? {
              ok: false,
              message: `${unavailable.message} Hint: ${WORKSPACE_MESSAGES[result.workspaceIssue]}`,
            }
          : unavailable;
      default:
        return { ok: false, message: "Model provider connection test failed." };
    }
  } catch {
    return { ok: false, message: "Model provider connection test failed." };
  }
}
