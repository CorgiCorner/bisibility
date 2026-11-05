import "server-only";
import { type AccountAdapter, capacity, classifyTypedError, object, probe } from "./adapter";

export const dataForSeoAccountAdapter: AccountAdapter = {
  conditions: [
    "provider_billing",
    "provider_auth",
    "provider_account_restricted",
    "provider_rate_limited",
    "provider_transient",
  ],
  probe: {
    available: true,
    cost: "non_billable",
    verifies: ["authentication", "access", "capacity"],
    automaticRecheck: [
      "provider_billing",
      "provider_account_restricted",
      "provider_transient",
      "legacy_unverified",
    ],
  },
  capacity: {
    unit: "usd",
    minimum: ({ estimatedCostUsd }) =>
      estimatedCostUsd !== undefined && Number.isFinite(estimatedCostUsd) && estimatedCostUsd > 0
        ? estimatedCostUsd
        : null,
  },
  classify({ status, body, scope }) {
    const data = object(body);
    const tasks = Array.isArray(data.tasks) ? data.tasks.map(object) : [];
    const codes = [data.status_code, ...tasks.map((task) => task.status_code)];
    if ((status === 403 || (status >= 200 && status < 300)) && codes.includes(40104))
      return { kind: "failure", code: "provider_account_restricted", scope: { kind: "account" } };
    if ((status === 403 || (status >= 200 && status < 300)) && codes.includes(40201))
      return { kind: "failure", code: "provider_account_restricted", scope };
    if (
      status === 402 ||
      ((status === 403 || (status >= 200 && status < 300)) &&
        (codes.includes(40200) || codes.includes(40210)))
    )
      return { kind: "failure", code: "provider_billing", scope };
    if (status === 401)
      return { kind: "failure", code: "provider_auth", scope: { kind: "account" } };
    if (status === 429) return { kind: "failure", code: "provider_rate_limited", scope };
    if (
      status < 200 ||
      status >= 300 ||
      data.status_code !== 20000 ||
      tasks.some((task) => task.status_code !== 20000)
    )
      return { kind: "failure", code: "provider_transient", scope };
    const result = Array.isArray(tasks[0]?.result) ? object(tasks[0].result[0]) : {};
    const value = capacity(result.balance ?? object(result.money).balance ?? data.balance);
    return value === null
      ? { kind: "not_verified", scope }
      : { kind: "capacity", value, unit: "usd", scope };
  },
  classifyError: classifyTypedError,
  async check(credentials, scope) {
    if (!credentials.login || !credentials.password)
      return { kind: "failure", code: "provider_auth", scope: { kind: "account" } };
    const authorization = Buffer.from(`${credentials.login}:${credentials.password}`).toString(
      "base64",
    );
    return probe(
      "https://api.dataforseo.com/v3/appendix/user_data",
      { headers: { Authorization: `Basic ${authorization}` } },
      scope,
      dataForSeoAccountAdapter.classify,
    );
  },
};
