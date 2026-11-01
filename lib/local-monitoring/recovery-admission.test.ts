import {
  ProviderRecoveryAdmissionError,
  ProviderUsagePersistenceError,
} from "@/lib/providers/usage";
import { expect, it } from "vitest";
import { executionFixture } from "./execution.test-fixture";
import { submitLocalTarget } from "./submit";

it.each(["account_blocked", "accounting_review"] as const)(
  "keeps local monitoring's pre-dispatch outcome for %s",
  async (reason) => {
    const error = new ProviderRecoveryAdmissionError(reason, { kind: "account" });
    expect(error).toBeInstanceOf(ProviderUsagePersistenceError);
    const fixture = executionFixture();
    fixture.journal.beforeDispatch = async () => {
      throw error;
    };
    await expect(submitLocalTarget(fixture)).rejects.toBe(error);
    expect(fixture.state.submitCalls).toBe(0);
  },
);
