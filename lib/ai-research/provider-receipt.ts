import type { DataForSeoResponse } from "@/lib/providers/serp/dataforseo-payload";
import type { ProviderUsageReceipt } from "@/lib/providers/usage";

// One live task per request. Its cost already includes the request base and model/tool
// spending; conflicting or missing receipt amounts remain unknown for reconciliation.
export function aiUsageReceipt(
  data: DataForSeoResponse | null,
  response: Pick<Response, "ok">,
): ProviderUsageReceipt {
  const task = data?.tasks?.length === 1 ? data.tasks[0] : undefined;
  const cost = task?.cost;
  const valid =
    typeof cost === "number" &&
    Number.isFinite(cost) &&
    cost >= 0 &&
    Number.isFinite(cost * 100) &&
    cost * 100 <= 999999.9999 &&
    (data?.cost === undefined ||
      (typeof data.cost === "number" &&
        Number.isFinite(data.cost) &&
        data.cost >= 0 &&
        Number.isFinite(cost * 100) &&
        cost * 100 <= 999999.9999 &&
        Math.abs(data.cost - cost) < 1e-9));
  return {
    cached: false,
    costCents: valid ? Number((cost * 100).toFixed(4)) : null,
    failed: !response.ok || data?.status_code !== 20000 || task?.status_code !== 20000,
    providerRequestId: task?.id,
    quantity: valid ? 1 : null,
  };
}
