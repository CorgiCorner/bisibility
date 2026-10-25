import "server-only";

import { ID_LIST_PATH, ORGANIC_GET_PATH } from "./capabilities";
import { consumeHistoryLimit, type HistoryAccount, historyCooldown } from "./limiter";
import { array, lookupFailure, record, status } from "./outcomes";

export type {
  HistoryResponse,
  HistoryTransport,
  IdListQuery,
} from "@/lib/provider-evidence/recovery/adapter";

import type { HistoryResponse, IdListQuery } from "@/lib/provider-evidence/recovery/adapter";

export function assertHistoryRequest(method: string, path: string) {
  if (method === "POST" && path === ID_LIST_PATH) return;
  if (method === "GET" && path.startsWith(`${ORGANIC_GET_PATH}/`)) {
    const id = path.slice(ORGANIC_GET_PATH.length + 1);
    if (/^[a-zA-Z0-9-]+$/.test(id)) return;
  }
  throw new Error("Recovery transport refuses this method or endpoint.");
}

function envelopeFailure(body: unknown) {
  const top = status(body);
  const tasks = array(record(body)?.tasks).map(status);
  const codes = [top.code, ...tasks.map((task) => task.code)];
  if (codes.some((code) => code === 40202 || code === 40209)) return "rate_limited";
  if (codes.some((code) => code !== null && code >= 50000)) return "outage";
  return null;
}

export function createHistoryTransport(
  originalAccount: HistoryAccount,
  dependencies: {
    fetch?: typeof fetch;
    limit?: typeof consumeHistoryLimit;
  } = {},
) {
  const account = Object.freeze({ ...originalAccount });
  const send = dependencies.fetch ?? fetch;
  const limit = dependencies.limit ?? consumeHistoryLimit;

  async function request(
    method: "POST" | "GET",
    path: string,
    query?: IdListQuery,
  ): Promise<HistoryResponse> {
    assertHistoryRequest(method, path);
    if (!account.accountId || !account.credentialVersion || !account.login || !account.password) {
      return lookupFailure("operator_review", "missing_original_account_binding");
    }
    try {
      const limited = await limit(account, method === "POST");
      if (limited) return limited;
      const response = await send(`https://api.dataforseo.com${path}`, {
        method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${account.login}:${account.password}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        ...(query ? { body: JSON.stringify([query]) } : {}),
        redirect: "error",
        signal: AbortSignal.timeout(45_000),
      });
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after"));
        return lookupFailure(
          "rate_limited",
          "provider_http_limit",
          Math.max(historyCooldown(account), Number.isFinite(retryAfter) ? retryAfter * 1000 : 0),
        );
      }
      if (response.status >= 500) return lookupFailure("outage", "provider_http_outage", 60_000);
      if (!response.ok) return lookupFailure("operator_review", "provider_http_error");
      const body: unknown = await response.json();
      const failure = envelopeFailure(body);
      if (failure && method === "POST") {
        return lookupFailure(
          failure,
          "provider_lookup_status",
          failure === "outage" ? 60_000 : historyCooldown(account),
        );
      }
      if (failure === "rate_limited") historyCooldown(account);
      return { kind: "response", body };
    } catch {
      return lookupFailure("outage", "history_transport_unavailable", 60_000);
    }
  }

  return {
    listIds: (query: IdListQuery) => request("POST", ID_LIST_PATH, query),
    getTask: (id: string) => request("GET", `${ORGANIC_GET_PATH}/${id}`),
  };
}
