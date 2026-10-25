import "server-only";
import type { ProviderRecoveryAdapter } from "@/lib/provider-evidence/recovery/adapter";
import { originalRecoveryAccount } from "./account";
import { historyCapability } from "./capabilities";
import { getHistoryTask, listHistory } from "./history";
import { matchHistoryTask } from "./matcher";
import { metadataWindow, resultRetention } from "./retention";
import { createHistoryTransport } from "./transport";

export const dataforseoRecoveryAdapter: ProviderRecoveryAdapter = {
  provider: "dataforseo",
  capability: historyCapability,
  resolveAccount: originalRecoveryAccount,
  createTransport: (account) =>
    createHistoryTransport({
      accountId: account.accountId,
      credentialVersion: account.credentialVersion,
      login: typeof account.login === "string" ? account.login : "",
      password: typeof account.password === "string" ? account.password : "",
    }),
  listHistory,
  getTask: getHistoryTask,
  matchTask: matchHistoryTask,
  retention: (identity, now) =>
    identity.executionMode === "queued"
      ? resultRetention(identity.createdAt.toISOString(), now)
      : metadataWindow(
          new Date(identity.createdAt.getTime() - 1000).toISOString(),
          now.toISOString(),
          now,
        ),
};
