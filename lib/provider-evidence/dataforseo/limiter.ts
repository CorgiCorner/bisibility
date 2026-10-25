import "server-only";

import { consume } from "@/lib/api/ratelimit";
import {
  consumeProviderLimit,
  providerAccountKey,
  writeCooldown,
} from "@/lib/providers/rate-limit";
import { lookupFailure } from "./outcomes";

export type HistoryAccount = Readonly<{
  accountId: string;
  credentialVersion: string;
  login: string;
  password: string;
}>;

export async function consumeHistoryLimit(account: HistoryAccount, idList: boolean) {
  const shared = await consumeProviderLimit("dataforseo", account);
  if (!shared.success) {
    return lookupFailure(
      "rate_limited",
      "shared_account_limit",
      Math.max(1, shared.resetAt - Date.now()),
    );
  }
  if (idList) {
    const history = await consume({
      bucketKey: providerAccountKey("dataforseo", account),
      prefix: "bisibility:provider:serp-id-list",
      limit: 10,
      windowSeconds: 60,
      requireShared: true,
    });
    if (!history.success) {
      return lookupFailure(
        "rate_limited",
        "id_list_account_limit",
        Math.max(1, history.resetAt - Date.now()),
      );
    }
  }
  return null;
}

export function historyCooldown(account: HistoryAccount) {
  return Math.max(1, writeCooldown(providerAccountKey("dataforseo", account)) - Date.now());
}
