import "server-only";
import {
  type ProviderFeatureRate,
  providerFeatureOperation,
} from "@/lib/cost-estimate/provider-feature-rates";
import type { Prisma } from "@/lib/generated/prisma/client";
import { meteringNamespace } from "@/lib/metering/runtime";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import type { ProviderHistoryWindow } from "@/lib/providers/history-window";
import { formatQuantity } from "@usagekit/core";
import { nativeProviderCatalog } from "./catalog-source";
import { loadNativeProviderQuote, ProviderQuoteUnavailableError } from "./native-quote";

type Database = Pick<Prisma.TransactionClient, "providerConnection" | "$queryRaw">;
type Connection = { id: string; provider: string; credentialsEncrypted: string | null };

/** Use the request extractor so omitted flags and unknown historical counts stay distinct. */
export function nativeFeatureOptions(
  rate: ProviderFeatureRate,
  count: number,
  clickstream?: boolean,
  historyWindow?: ProviderHistoryWindow,
) {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error("Invalid feature item count");
  const operation = providerFeatureOperation(rate);
  if (!operation) throw new Error("Unknown feature operation");
  const task: Record<string, unknown> = {};
  if (["backlinks_history", "historical_rank_overview"].includes(rate.feature) && historyWindow) {
    task.date_from = historyWindow.dateFrom;
    task.date_to = historyWindow.dateTo;
  }
  if (rate.feature === "keyword_metrics") {
    if (count > 700) throw new Error("Keyword metrics accepts at most 700 keywords");
    task.keywords = Array.from({ length: count }, () => "");
    task.include_clickstream_data = clickstream ?? false;
  } else if (rate.feature.startsWith("keyword_research_")) {
    task.limit = count;
    task.include_clickstream_data = clickstream ?? false;
  } else if (rate.feature === "domain_rank_overview") {
    task.limit = 1;
  } else if (["ranked_keywords", "relevant_pages", "backlinks_rows"].includes(rate.feature)) {
    task.limit = Math.min(1_000, count);
  }
  const matched = nativeProviderCatalog.match("dataforseo", {
    method: "POST",
    url: `https://api.dataforseo.com/v3/${operation.replaceAll(".", "/")}`,
    body: [task],
  });
  if (matched.operation === "unknown") throw new Error("Unknown feature request");
  return matched.options;
}

/** Returns null only for a non-catalog provider or deployment-owned credentials. */
export async function loadNativeFeatureCostCents(
  db: Database,
  input: {
    connection: Connection;
    feature: string;
    includeClickstream?: boolean;
    historyWindow?: ProviderHistoryWindow;
    itemCount: number;
    rate: ProviderFeatureRate | null;
  },
) {
  const operation = providerFeatureOperation(input.rate);
  if (!operation || !input.rate || input.connection.provider !== "dataforseo") return null;
  const connection = await db.providerConnection.findUnique({
    where: { id: input.connection.id },
    select: {
      projectId: true,
      credentialSource: true,
      credentialsEncrypted: true,
      enabled: true,
      status: true,
      project: { select: { ownerId: true } },
    },
  });
  if (!connection) throw new Error("Provider pricing connection is unavailable");
  if (connection.credentialSource === "hosted") return null;
  if (!connection.enabled || connection.status !== "connected")
    throw new ProviderQuoteUnavailableError();
  if (connection.credentialsEncrypted !== input.connection.credentialsEncrypted)
    throw new Error("Provider pricing credential binding changed");
  const version = ownCredentialVersion(
    input.connection.provider,
    input.connection.id,
    connection.credentialsEncrypted,
  );
  if (!version) throw new Error("Provider pricing credentials are unavailable");
  const quote = await loadNativeProviderQuote(
    db,
    {
      namespace: meteringNamespace(),
      principal: connection.project.ownerId,
      projectId: connection.projectId,
      connectionId: input.connection.id,
      provider: input.connection.provider,
      providerCredentialVersion: version,
      fundingSource: "byok",
    },
    input.feature,
    operation,
    nativeFeatureOptions(
      input.rate,
      input.itemCount,
      input.includeClickstream,
      input.historyWindow,
    ),
  );
  const amount = quote.quantities.find((q) => q.unit === "cents");
  if (!amount) throw new Error("Provider request has no monetary estimate");
  return Number(formatQuantity(amount));
}
