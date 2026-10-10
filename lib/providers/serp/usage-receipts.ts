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
  const providerFailed = Boolean(data?.error) || status === "Error";
  const failed = !response.ok || providerFailed;
  return {
    cached,
    costCents: 0,
    failed,
    providerRequestId: data?.search_metadata?.id,
    quantity:
      providerFailed && status === "Success"
        ? null
        : cached || providerFailed
          ? 0
          : status === "Success"
            ? 1
            : null,
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
  const failed =
    !response.ok ||
    data?.status_code !== 20000 ||
    Boolean(data.tasks?.some((task) => task.status_code !== 20000));
  return {
    cached: false,
    costCents:
      data && hasCost
        ? failed
          ? dataForSeoFailureCostCents(data)
          : dataForSeoResponseCostCents(data)
        : null,
    failed,
    providerRequestId: data?.tasks?.length === 1 ? data.tasks[0].id : undefined,
    quantity: 1,
  };
}

export function dataForSeoFailureCostCents(data: DataForSeoResponse): number | null {
  const rootCost = data.cost;
  if (
    rootCost !== undefined &&
    (typeof rootCost !== "number" || !Number.isFinite(rootCost) || rootCost < 0)
  ) {
    return null;
  }
  const validTaskCost = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0;
  if (
    rootCost === undefined &&
    (!data.tasks?.length || !data.tasks.every((task) => validTaskCost(task.cost)))
  ) {
    return null;
  }
  const cost = dataForSeoResponseCostCents(data);
  return Number.isFinite(cost) && cost >= 0 ? cost : null;
}
