import type { OssAdminData } from "@/components/admin/redesign/OssAdminViews";
import { renderWithInstanceAdminMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { routerMock, setNavigationState } from "@/tests/next-navigation";
import { act, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  composition: vi.fn(() => null),
  change: vi.fn(),
  limits: vi.fn(),
  lookup: vi.fn(),
  save: vi.fn(),
  clear: vi.fn(),
  send: vi.fn(),
  sweep: vi.fn(),
  preview: vi.fn(),
  commit: vi.fn(),
  triage: vi.fn(),
  command: vi.fn(),
}));
vi.mock("@/components/admin/redesign/OssAdminComposition", () => ({
  OssAdminComposition: mocks.composition,
}));
vi.mock("@/lib/actions/instance-admin-account-actions", () => ({
  setInstanceAdminAccountDeactivated: mocks.change,
  resetInstanceAdminAccountLimits: mocks.limits,
}));
vi.mock("@/lib/actions/instance-admin-pages", () => ({ lookupOssAdminAccount: mocks.lookup }));
vi.mock("@/lib/actions/instance-mail-settings", () => ({
  saveInstanceMailSettings: mocks.save,
  clearInstanceMailSettings: mocks.clear,
}));
vi.mock("@/lib/actions/instance-admin", () => ({
  sendTestSlackNotification: mocks.send,
  runOpsSweepNow: mocks.sweep,
}));
vi.mock("@/lib/actions/metering-recovery", () => ({
  previewRecoveryAction: mocks.preview,
  commitRecoveryAction: mocks.commit,
  updateRecoveryTriageAction: mocks.triage,
  getRecoveryCommandAction: mocks.command,
}));

import { OssLivePage } from "./OssLivePage";
import { account, fixture } from "./page-fixtures.test-fixture";

const [caseA, caseB] = fixture.tasks?.page?.rows ?? [];

const data = () => (mocks.composition.mock.lastCall as unknown as [{ data: OssAdminData }])[0].data;
beforeEach(() => {
  vi.clearAllMocks();
  setNavigationState({
    pathname: "/app/admin/users/accounts",
    searchParams: new URLSearchParams(),
  });
});
it.each(["deactivate", "reactivate", "reset"] as const)(
  "dispatches account %s with the selected public ID",
  async (action) => {
    mocks.change.mockResolvedValue({ status: "completed", accountStatus: "deactivated" });
    mocks.limits.mockResolvedValue({ status: "completed", clearedBuckets: 2 });
    render(<OssLivePage view="Accounts" data={{ accounts: fixture.accounts }} />);
    await act(async () => {
      await data().administration?.onAccountAction(action, account.id);
    });
    if (action === "reset") expect(mocks.limits).toHaveBeenCalledWith({ userId: account.id });
    else
      expect(mocks.change).toHaveBeenCalledWith({
        userId: account.id,
        deactivated: action === "deactivate",
      });
    expect(routerMock.refresh).toHaveBeenCalledOnce();
  },
);
it("performs audited lookup and supplies the returned detail rather than the list summary", async () => {
  mocks.lookup.mockResolvedValue({ status: "found", account });
  const view = render(<OssLivePage view="Accounts" data={{ accounts: fixture.accounts }} />);
  await act(async () => {
    data().administration?.onLookup("operator@example.test");
  });
  expect(mocks.lookup).toHaveBeenCalledWith("operator@example.test");
  setNavigationState({
    pathname: "/app/admin/users/accounts",
    searchParams: new URL(routerMock.push.mock.lastCall?.[0] as string, "http://localhost")
      .searchParams,
  });
  view.rerender(<OssLivePage view="Accounts" data={{ accounts: fixture.accounts }} />);
  await waitFor(() => expect(data().administration?.account).toEqual(account));
});
it("wires mail save and clear to their existing server actions", async () => {
  mocks.save.mockResolvedValue({ status: "saved" });
  mocks.clear.mockResolvedValue({ status: "cleared" });
  render(<OssLivePage view="Settings" data={{ settings: fixture.settings }} />);
  const settings = {
    provider: "smtp",
    sender: "test@example.test",
    smtpHost: "mail.example.test",
    smtpPort: "587",
    smtpUsername: "test",
    smtpPassword: "test-only",
    resendApiKey: "",
    sesRegion: "",
    sesAccessKeyId: "",
    sesSecretAccessKey: "",
    replaceCredentials: true,
  } as const;
  await act(async () => {
    await data().administration?.onSaveMail(settings);
    await data().administration?.onClearMail();
  });
  expect(mocks.save).toHaveBeenCalledWith(settings);
  expect(mocks.clear).toHaveBeenCalledWith();
  expect(routerMock.refresh).toHaveBeenCalledTimes(2);
});
it("wires both operational actions and refreshes after their result", async () => {
  mocks.send.mockResolvedValue({ status: "delivered" });
  mocks.sweep.mockResolvedValue({ status: "completed", attempted: 3, delivered: 2 });
  render(<OssLivePage view="Notifications" data={{ operations: fixture.operations }} />);
  await act(async () => {
    await data().operations?.onSendTest();
    await data().operations?.onRunSweep();
  });
  expect(mocks.send).toHaveBeenCalledWith();
  expect(mocks.sweep).toHaveBeenCalledWith();
  expect(routerMock.refresh).toHaveBeenCalledTimes(2);
});
it("previews selected tokens, commits the frozen preview idempotently and reads command status", async () => {
  const preview = {
    token: "preview-token",
    expiresAt: "2099-01-01T00:00:00Z",
    eligible: [],
    excluded: [],
    newPaidAttempts: 0 as const,
    providerCalls: 0 as const,
    originalRuns: 0,
  };
  mocks.preview.mockResolvedValue({ ok: true, value: preview });
  mocks.commit.mockResolvedValue({
    ok: true,
    value: { commandId: "command", state: "queued", outcomes: [] },
  });
  mocks.command.mockResolvedValue({
    ok: true,
    value: { commandId: "command", state: "completed", outcomes: [] },
  });
  const view = render(<OssLivePage view="Tasks" data={{ tasks: fixture.tasks }} />);
  await act(async () => {
    data().recovery?.onPreview([caseA.reference, caseB.reference]);
  });
  expect(mocks.preview).toHaveBeenCalledWith({ caseTokens: [caseA.token, caseB.token] });
  // The URL names the cases by reference; tokens never enter it.
  expect(routerMock.push.mock.lastCall?.[0]).toContain(caseA.reference);
  expect(routerMock.push.mock.lastCall?.[0]).not.toContain(caseA.token);
  setNavigationState({
    pathname: "/app/admin/users/accounts",
    searchParams: new URL(routerMock.push.mock.lastCall?.[0] as string, "http://localhost")
      .searchParams,
  });
  view.rerender(<OssLivePage view="Tasks" data={{ tasks: fixture.tasks }} />);
  await waitFor(() => expect(data().recovery?.preview).toEqual(preview));
  await act(async () => {
    await data().recovery?.onConfirm(preview);
  });
  expect(mocks.commit).toHaveBeenCalledWith({
    previewToken: "preview-token",
    commandId: expect.any(String),
  });
  expect(mocks.command).toHaveBeenCalledWith(mocks.commit.mock.calls[0][0].commandId);
});
it("maps triage versions, assignment, nullable reason and due date exactly", async () => {
  mocks.triage.mockResolvedValue({ ok: true, value: { status: "waiting_evidence" } });
  render(<OssLivePage view="Tasks" data={{ tasks: fixture.tasks }} />);
  const row = fixture.tasks?.page.rows[0];
  if (!row) throw new Error("Missing recovery case fixture.");
  await act(async () => {
    data().recovery?.onSaveTriage(row, {
      status: "waiting_evidence",
      reason: "missing_proof",
      due: "24",
      snoozedUntil: "2026-12-01T00:00:00.000Z",
      assign: true,
    });
  });
  expect(mocks.triage).toHaveBeenCalledWith({
    caseToken: row.token,
    expectedVersion: row.version,
    status: "waiting_evidence",
    reason: "missing_proof",
    assignToMe: true,
    snoozedUntil: "2026-12-01T00:00:00.000Z",
  });
  expect(routerMock.refresh).toHaveBeenCalledOnce();
});
it("persists account search, sort and paging without discarding other URL state", async () => {
  setNavigationState({
    pathname: "/app/admin/users/accounts",
    searchParams: new URLSearchParams("search=old&eventsSort=created"),
  });
  render(<OssLivePage view="Accounts" data={{ accounts: fixture.accounts }} />);
  await act(async () => {
    data().administration?.accountList?.onSearch("new@example.test");
  });
  expect(routerMock.push).toHaveBeenLastCalledWith(
    "/app/admin/users/accounts?search=new%40example.test&eventsSort=created&page=1",
    { scroll: false },
  );
  await act(async () => {
    data().administration?.accountList?.onSort({ field: "projects", direction: "asc" });
  });
  expect(
    Object.fromEntries(
      new URL(routerMock.push.mock.lastCall?.[0] as string, "http://localhost").searchParams,
    ),
  ).toMatchObject({ sort: "projects", direction: "asc", page: "1" });
  await act(async () => {
    data().administration?.accountList?.onPage({ page: 2, pageSize: 50 });
  });
  expect(
    Object.fromEntries(
      new URL(routerMock.push.mock.lastCall?.[0] as string, "http://localhost").searchParams,
    ),
  ).toMatchObject({ page: "2", pageSize: "50" });
});
it("retains task and audit filters in navigation callbacks", async () => {
  const view = render(
    <OssLivePage view="Tasks" data={{ tasks: fixture.tasks, audit: fixture.audit }} />,
  );
  await act(async () => {
    data().recovery?.onPage("next", { category: "failed", provider: "source" });
  });
  expect(routerMock.push.mock.lastCall?.[0]).toContain(
    "cursor=next&category=failed&provider=source",
  );
  view.rerender(<OssLivePage view="Audit" data={{ audit: fixture.audit }} />);
  await act(async () => {
    data().audit?.onFilterChange?.("account");
  });
  expect(routerMock.push.mock.lastCall?.[0]).toContain("filter=account");
});

it("P3-2 uses the server-normalized audit filter over the invalid URL", () => {
  setNavigationState({
    pathname: "/app/admin/users/accounts",
    searchParams: new URLSearchParams("filter=invalid"),
  });
  if (!fixture.audit) throw new Error("Missing audit fixture");
  render(<OssLivePage view="Audit" data={{ audit: { ...fixture.audit, initialFilter: "all" } }} />);
  expect(data().audit?.initialFilter).toBe("all");
});
it.each(["unavailable", "throw"])(
  "P2-2 retains ambiguous %s command identity and offers a status read",
  async (mode) => {
    const preview = {
      token: "signed-preview",
      expiresAt: "2099-01-01T00:00:00Z",
      eligible: [],
      excluded: [],
      newPaidAttempts: 0 as const,
      providerCalls: 0 as const,
      originalRuns: 0,
    };
    mocks.preview.mockResolvedValue({ ok: true, value: preview });
    if (mode === "throw") mocks.commit.mockRejectedValue(new Error("lost response"));
    else mocks.commit.mockResolvedValue({ ok: false, code: "unavailable" });
    mocks.command.mockResolvedValue({ ok: false, code: "unavailable" });
    const view = render(<OssLivePage view="Tasks" data={{ tasks: fixture.tasks }} />);
    await act(async () => {
      data().recovery?.onPreview([caseA.reference]);
    });
    setNavigationState({
      pathname: "/app/admin/users/accounts",
      searchParams: new URL(routerMock.push.mock.lastCall?.[0] as string, "http://localhost")
        .searchParams,
    });
    view.rerender(<OssLivePage view="Tasks" data={{ tasks: fixture.tasks }} />);
    await waitFor(() => expect(data().recovery?.preview).toEqual(preview));
    await act(async () => {
      expect(await data().recovery?.onConfirm(preview)).toBe(false);
    });
    const id = mocks.commit.mock.calls[0][0].commandId;
    expect(
      new URL(routerMock.push.mock.lastCall?.[0] as string, "http://localhost").searchParams.get(
        "command",
      ),
    ).toBe(id);
    expect(mocks.command).toHaveBeenCalledWith(id);
    expect(data().recovery?.commandError).toBeTruthy();
    await act(async () => {
      data().recovery?.onRetryCommand();
    });
    expect(mocks.command.mock.calls.filter(([value]) => value === id).length).toBeGreaterThan(1);
  },
);

it("P2-R1 Tasks prepares a different selection after a definitive rejection", async () => {
  const preview = {
    token: "preview-a",
    expiresAt: "2099-01-01T00:00:00Z",
    eligible: [],
    excluded: [],
    newPaidAttempts: 0 as const,
    providerCalls: 0 as const,
    originalRuns: 0,
  };
  mocks.preview.mockResolvedValue({ ok: true, value: preview });
  mocks.commit.mockResolvedValue({ ok: false, code: "case_changed" });
  const view = render(<OssLivePage view="Tasks" data={{ tasks: fixture.tasks }} />);
  const navigate = () => {
    setNavigationState({
      pathname: "/app/admin/users/accounts",
      searchParams: new URL(routerMock.push.mock.lastCall?.[0] as string, "http://local")
        .searchParams,
    });
    view.rerender(<OssLivePage view="Tasks" data={{ tasks: fixture.tasks }} />);
  };
  await act(async () => data().recovery?.onPreview([caseA.reference]));
  navigate();
  await waitFor(() => expect(data().recovery?.preview).toEqual(preview));
  await act(async () => {
    expect(await data().recovery?.onConfirm(preview)).toBe(false);
  });
  navigate();
  expect(data().recovery?.preview).toBeNull();
  expect(mocks.command).not.toHaveBeenCalled();
  mocks.preview.mockResolvedValue({ ok: true, value: { ...preview, token: "preview-b" } });
  await act(async () => data().recovery?.onPreview([caseB.reference]));
  navigate();
  await waitFor(() => expect(data().recovery?.preview?.token).toBe("preview-b"));
  expect(mocks.preview).toHaveBeenCalledWith({ caseTokens: [caseB.token] });
});
