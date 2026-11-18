import type { ProviderRequestSource } from "@/lib/provider-usage/tag";
import type { ModelCatalogSnapshot, ModelProvider } from "@/lib/providers/model/types";
import type { ModelPaymentDatabase } from "./admission-storage";
import type { ModelPlaygroundCatalogRequest } from "./catalog-request";
import type { ModelPaymentContext } from "./payment";
import type { ModelColumn, ModelPlaygroundInput } from "./types";

export type ModelRunIdentity = { projectId: string; runId: string };

export type ModelConnectionResolution = {
  fundingSource?: "byok" | "platform";
  platformKeyId?: string;
  id: string;
  credentialVersion: string;
  accountDigest: string;
  apiKey: string;
  adapter: ModelProvider;
  catalog: ModelCatalogSnapshot;
};

export type ModelPlaygroundAccess = {
  actorId: string;
  projectId: string;
  principal: string;
  namespace: string;
};
export type ModelPlaygroundRuntime = {
  entrySource?: ProviderRequestSource;
  db: ModelPaymentDatabase;
  authorize: (action: "read" | "create") => Promise<ModelPlaygroundAccess>;
  resolve: (
    db: ModelPaymentDatabase,
    projectId: string,
    request: ModelPlaygroundCatalogRequest,
  ) => Promise<ModelConnectionResolution>;
  /** Cache-only catalog read for a read estimate. Absent or null means unknown cost; it never
   * calls the provider. */
  peekCatalog?: (
    db: ModelPaymentDatabase,
    projectId: string,
    request: ModelPlaygroundCatalogRequest,
  ) => Promise<ModelCatalogSnapshot | null>;
  valuation?: (
    column: ModelColumn,
    input: ModelPlaygroundInput,
  ) => Pick<ModelPaymentContext["columns"][number], "forecast" | "advisory"> &
    Pick<ModelPaymentContext["columns"][number]["binding"], "policy" | "rateCard">;
  now?: () => Date;
  /** Rebuild current columns for a newer revision, even for a create-once report.
   * Acknowledge the revision actually delivered. A held project returns held and
   * writes nothing. Owns transactions, never paid I/O. */
  onTerminal?: (
    db: ModelPaymentDatabase,
    input: { projectId: string; runId: string; revision: number },
  ) => Promise<{ revision: number } | { held: true }>;
  wait?: (milliseconds: number) => Promise<void>;
};
