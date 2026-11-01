import { expect, it, vi } from "vitest";

const record = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integrations/provider-recovery/account-failure", () => ({
  recordConnectionAccountFailure: record,
}));

import { recordRankAccountResponse } from "./account-evidence";

it.each([
  ["dataforseo", 200, { status_code: 40201 }, "provider_account_restricted"],
  ["serpapi", 429, { error: "You have run out of searches" }, "provider_billing"],
] as const)(
  "records %s response classification and preserves its scope",
  async (provider, status, body, code) => {
    await recordRankAccountResponse({
      feature: "rank_check",
      provider,
      status,
      body,
      projectId: "project",
      connectionId: "connection",
      credentialVersion: "version",
    });
    expect(record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fact: { kind: "failure", code, scope: { kind: "capability", capability: "rank_check" } },
      }),
    );
  },
);
