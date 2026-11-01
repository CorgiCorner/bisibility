import "server-only";
import { type AccountAdapter, capacity, classifyTypedError, object, probe } from "./adapter";

const exhausted =
  /run out of searches|(?:plan|search|monthly)(?:[ -]search)?[ -]limit|(?:exceeded|reached).*(?:searches|quota)|insufficient (?:funds|credits)|payment required/i;

export const serpApiAccountAdapter: AccountAdapter = {
  conditions: ["provider_billing", "provider_auth", "provider_rate_limited", "provider_transient"],
  probe: {
    available: true,
    cost: "unverified",
    verifies: ["authentication", "capacity"],
    automaticRecheck: [],
  },
  capacity: {
    unit: "searches",
    minimum: ({ searches }) =>
      searches === undefined ? 1 : Number.isSafeInteger(searches) && searches > 0 ? searches : null,
  },
  classify({ status, body, scope }) {
    const data = object(body);
    const message = typeof data.error === "string" ? data.error : "";
    if (status === 402 || ([200, 403, 429].includes(status) && exhausted.test(message)))
      return { kind: "failure", code: "provider_billing", scope };
    if (
      status === 401 ||
      ([200, 403].includes(status) &&
        /(?:invalid|incorrect) (?:api[ _-]?key|credentials)/i.test(message))
    )
      return { kind: "failure", code: "provider_auth", scope: { kind: "account" } };
    if (status === 429 || /rate limit|throttl/i.test(message))
      return { kind: "failure", code: "provider_rate_limited", scope };
    if (status < 200 || status >= 300 || message)
      return { kind: "failure", code: "provider_transient", scope };
    const value = capacity(data.total_searches_left) ?? capacity(data.plan_searches_left);
    return value === null
      ? { kind: "not_verified", scope }
      : { kind: "capacity", value, unit: "searches", scope };
  },
  classifyError: classifyTypedError,
  async check(credentials, scope) {
    if (!credentials.apiKey)
      return { kind: "failure", code: "provider_auth", scope: { kind: "account" } };
    const url = new URL("https://serpapi.com/account.json");
    url.searchParams.set("api_key", credentials.apiKey);
    return probe(url.toString(), {}, scope, serpApiAccountAdapter.classify);
  },
};
