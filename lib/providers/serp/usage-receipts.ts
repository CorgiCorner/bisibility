import type { ProviderUsageReceipt } from "@/lib/providers/usage";
import type { DataForSeoResponse } from "./dataforseo-payload";
import { dataForSeoResponseCostCents } from "./dataforseo-payload";
import type { SerpApiResponse } from "./serpapi-payload";

export function serpApiUsageReceipt(
  data: SerpApiResponse | null,
  response: Pick<Response, "ok">,
): ProviderUsageReceipt {
  const status = data?.search_metadata?.status;
  const cached = status === "Cached";
  const failed = !response.ok || Boolean(data?.error) || status === "Error";
  return {
    cached,
    costCents: 0,
    failed,
    providerRequestId: data?.search_metadata?.id,
    quantity: cached || failed ? 0 : status === "Success" ? 1 : null,
  };
}

export function dataForSeoUsageReceipt(
  data: DataForSeoResponse | null,
  response: Pick<Response, "ok">,
): ProviderUsageReceipt {
  const validCost = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0;
  const hasCost =
    validCost(data?.cost) ||
    Boolean(data?.tasks?.length && data.tasks.every((task) => validCost(task.cost)));
  return {
    cached: false,
    costCents: data && hasCost ? dataForSeoResponseCostCents(data) : null,
    failed:
      !response.ok ||
      data?.status_code !== 20000 ||
      Boolean(data.tasks?.some((task) => task.status_code !== 20000)),
    providerRequestId: data?.tasks?.length === 1 ? data.tasks[0].id : undefined,
    quantity: 1,
  };
}
