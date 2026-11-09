import type { OssAdminData } from "@/components/admin/redesign/OssAdminViews";
import * as fixtures from "@/components/admin/redesign/OssComposition.stories";
import * as lists from "@/components/admin/redesign/oss-account-stories.test-fixture";
import type { Story } from "@/components/admin/redesign/oss-story-fixtures-1";
import { sampleData } from "@/components/admin/redesign/oss-story-fixtures-1";
import { account } from "@/components/admin/redesign/oss-story-fixtures-2";
import { configuredMail } from "@/components/admin/redesign/oss-story-fixtures-3";
import type { AccountListInput } from "@/lib/instance-admin/account-list-input";
import { act } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { realPage } from "./real-page-mocks.test-fixture";

const pending: Array<() => void> = [];
function deferred<T>(value: T) {
  return new Promise<T>((resolve) => pending.push(() => resolve(value)));
}
afterEach(async () => {
  await act(async () => {
    for (const resolve of pending.splice(0)) resolve();
  });
  vi.useRealTimers();
});

export function prepareRealScenario(name: string) {
  vi.clearAllMocks();
  vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
  const scenario = { ...fixtures, ...lists }[name as keyof typeof fixtures] as Story | undefined;
  if (!scenario) throw new Error(`Missing fixture: ${name}`);
  // Reuse the accepted data cases, never their render/decorator or composition.
  const data: OssAdminData = scenario.args?.data ?? sampleData;
  const administration = data.administration;
  realPage.extraRoutes = [];
  realPage.navigate = () => {};
  realPage.refresh = () => {};
  realPage.allowed =
    administration?.twoFactorEnabled !== false && data.recovery?.twoFactorEnabled !== false;
  realPage.access.mockResolvedValue({
    user: { id: "fixture-admin", twoFactorEnabled: realPage.allowed },
  });
  realPage.params = new URLSearchParams();
  realPage.operational.mockResolvedValue(data.operations?.data);
  realPage.allowance.mockResolvedValue(data.emailAllowance?.allowance);
  realPage.mail.mockResolvedValue(
    administration?.mailSettings ?? {
      ...configuredMail,
      credentialsConfigured: false,
      envOverridesSaved: false,
      sender: "",
      hasPasswordCredential: false,
    },
  );
  realPage.configured.mockReturnValue(administration?.mailerConfigured ?? false);
  realPage.tasks.mockResolvedValue(data.recovery?.page);
  realPage.audit.mockImplementation(async ({ filter }: { filter?: string }) => ({
    filter: ["account", "setup", "ops"].includes(filter ?? "") ? filter : "all",
    entries: (data.audit?.entries ?? [])
      .filter((row) => !filter || filter === "all" || row.category === filter)
      .map((row) => ({
        ...row,
        createdAt: row.time,
        actorEmail: row.actor,
        targetId: row.target,
        action:
          row.category === "setup"
            ? "instance_admin.first_run_setting"
            : row.category === "account"
              ? "instance_admin.account_viewed"
              : row.action,
      })),
    nextCursor: data.audit?.nextCursor,
  }));
  realPage.accounts.mockImplementation(async (input: AccountListInput) => {
    let rows = [...(administration?.accounts ?? [])];
    const search = input.search?.toLowerCase() ?? "";
    rows = rows.filter(
      (row) =>
        row.id.toLowerCase().startsWith(search) || row.email.toLowerCase().startsWith(search),
    );
    const field = input.sort ?? "created";
    if (input.sort)
      rows.sort(
        (a, b) =>
          String(a[field] ?? "").localeCompare(String(b[field] ?? ""), "en", { numeric: true }) *
          (input.direction === "asc" ? 1 : -1),
      );
    const page = input.page ?? 1,
      pageSize = input.pageSize ?? 10;
    return {
      account: null,
      accounts: rows.slice((page - 1) * pageSize, page * pageSize),
      accountTotalCount: administration?.accounts?.length ?? 0,
      filteredCount: rows.length,
      page,
      pageSize,
      pageCount: Math.ceil(rows.length / pageSize),
    };
  });
  realPage.params.set("pageSize", "10");
  realPage.lookup.mockImplementation(async (id: string) => {
    const found =
      administration?.accounts?.find((r) => r.id === id || r.email === id) ??
      administration?.account ??
      (name === "AccountLookupParity" ? account : null);
    return { status: found ? "found" : "not_found", account: found };
  });
  if (administration?.account && !["AccountLookupParity", "AccountLookupForbidden"].includes(name))
    realPage.params.set("account", administration.account.id);
  if (administration?.error || name === "AccountLookupForbidden") {
    realPage.lookup.mockResolvedValue({
      status: name === "LookupRateLimit" ? "rate_limited" : "failed",
      account: null,
    });
    if (name !== "AccountLookupForbidden") realPage.params.set("account", "sample@example.com");
  }
  realPage.send.mockImplementation(
    data.operations?.onSendTest ?? (() => ({ status: "delivered" })),
  );
  realPage.sweep.mockImplementation(
    data.operations?.onRunSweep ?? (() => ({ status: "completed" })),
  );
  realPage.change.mockImplementation(
    administration?.onAccountAction
      ? ({ deactivated, userId }) =>
          administration.onAccountAction(deactivated ? "deactivate" : "reactivate", userId)
      : () => ({ status: "completed" }),
  );
  realPage.reset.mockImplementation(
    administration?.onAccountAction
      ? ({ userId }) => administration.onAccountAction("reset", userId)
      : () => ({ status: "completed" }),
  );
  realPage.save.mockImplementation(administration?.onSaveMail ?? (() => ({ status: "saved" })));
  realPage.clear.mockImplementation(administration?.onClearMail ?? (() => ({ status: "cleared" })));
  if (name === "MailSaveParity")
    realPage.save.mockImplementation(async () => {
      realPage.mail.mockResolvedValue({ ...configuredMail, envOverridesSaved: false });
      return { status: "saved" };
    });
  realPage.preview.mockResolvedValue({
    ok: true,
    value: data.recovery?.preview ?? {
      token: "fixture",
      expiresAt: "2099-11-03T10:00:00Z",
      eligible: [],
      excluded: [],
      newPaidAttempts: 0,
      providerCalls: 0,
      originalRuns: 0,
    },
  });
  realPage.command.mockResolvedValue(
    data.recovery?.commandError
      ? { ok: false, code: "unavailable" }
      : {
          ok: true,
          value: data.recovery?.command ?? {
            commandId: "fixture-command",
            state: "completed",
            outcomes: [],
          },
        },
  );
  realPage.commit.mockResolvedValue({
    ok: true,
    value: data.recovery?.command ?? { commandId: "fixture", state: "queued", outcomes: [] },
  });
  realPage.triage.mockResolvedValue(
    data.recovery?.triageError
      ? { ok: false, code: "unavailable" }
      : { ok: true, value: { status: "open" } },
  );
  if (data.recovery?.initialDetail) realPage.params.set("case", data.recovery.initialDetail.token);
  if (data.recovery?.command || data.recovery?.commandError)
    realPage.params.set("command", "fixture-command");
  if (data.recovery?.initialDialogOpen)
    realPage.params.set(
      "batch",
      JSON.stringify([data.recovery.page?.rows[0]?.token ?? "fixture-case"]),
    );
  if (name === "AccountLookupForbidden") realPage.lookup.mockResolvedValue(null);
  if (name === "RecoveryError") {
    realPage.preview.mockResolvedValue({ ok: false, code: "unavailable" });
    realPage.params.set("batch", JSON.stringify(["fixture-case"]));
  }
  if (name === "AdministrationBusy") {
    realPage.params.set("account", "sample@example.com");
    realPage.lookup.mockImplementation(() => deferred({ status: "not_found", account: null }));
  }
  if (name === "UnavailableAccounts") realPage.accounts.mockRejectedValue(new Error("offline"));
  if (name === "RecoveryUnavailable") realPage.tasks.mockRejectedValue(new Error("offline"));
  if (name === "RecoveryBatchPending")
    realPage.commit.mockImplementation(() => deferred({ ok: false, code: "unavailable" }));
  if (name === "RecoveryBatchError")
    realPage.commit.mockResolvedValue({ ok: false, code: "unavailable" });
  if (name === "ManyAccounts") {
    realPage.params.set("sort", "email");
    realPage.params.set("direction", "asc");
  }
  if (name === "OpsPending") {
    realPage.send.mockImplementation(() => deferred({ status: "delivered" }));
    realPage.sweep.mockImplementation(() =>
      deferred({ status: "completed", attempted: 0, delivered: 0 }),
    );
  }
  if (name === "MailPending") realPage.save.mockImplementation(() => deferred({ status: "saved" }));
  if (name === "MailClearPending")
    realPage.clear.mockImplementation(() => deferred({ status: "cleared" }));
  return { scenario, data };
}
