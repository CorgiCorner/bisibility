import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { ExtendSnapshotAction, SnapshotExtensionView } from "@/lib/serp/snapshot-extension";
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SnapshotExtensionControl } from "./SnapshotExtensionControl";

const payment = paymentQuote({
  expiresAt: "2026-09-28T10:15:00.000Z",
  charge: {
    value: "1",
    certainty: "estimate",
    unit: {
      kind: "provider_native",
      providerId: "future-provider",
      key: "searches",
      singular: "search",
      plural: "searches",
    },
  },
});
vi.mock("@/lib/actions/action-payment", () => ({
  assessActionPaymentsAction: async () => ({
    allowed: true,
    reason: null,
    charges: [payment.charge],
  }),
}));
const props = {
  checkId: "check_1",
  projectRef: "prj_1",
  formatDateTime: (value: string) => value,
  previewAction: vi.fn(async () => ({
    ok: true as const,
    payment,
    paymentOptions: [payment.option],
  })),
};

const extension: SnapshotExtensionView = {
  reason: "available",
  expiresAt: "2026-09-28T10:15:00.000Z",
  nextStart: 20,
  pages: [],
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T10:02:00.000Z"));
});
afterEach(() => vi.useRealTimers());
const open = async () => {
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: /^Fetch next 10 results/ })),
  );
};
const confirm = () => fireEvent.click(screen.getByRole("button", { name: "Start" }));

describe("snapshot continuation control", () => {
  it("explains time, cost and duplicates before one confirmed request and reloads after saving", async () => {
    let complete!: (value: { ok: true }) => void;
    const action = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          complete = resolve;
        }),
    );
    const onReload = vi.fn(async () => undefined);
    render(
      <SnapshotExtensionControl
        {...props}
        extension={extension}
        action={action}
        onReload={onReload}
      />,
    );
    await open();
    expect(screen.getByRole("dialog")).toHaveTextContent("#21 to #30");
    expect(screen.getByRole("dialog")).toHaveTextContent("≈ 1 search");
    expect(screen.getByRole("dialog")).toHaveTextContent("Repeated URLs are skipped automatically");
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Historical rank and check comparisons stay unchanged",
    );
    expect(action).not.toHaveBeenCalled();
    act(() => {
      confirm();
      confirm();
    });
    expect(action).toHaveBeenCalledExactlyOnceWith({
      paymentOptionId: payment.option.id,
      acceptedPayment: { quoteToken: payment.quoteToken },
      checkId: props.checkId,
      projectId: props.projectRef,
      nextStart: 20,
    });
    expect(screen.queryByRole("dialog")).toBeNull();

    await act(async () => complete({ ok: true }));
    expect(onReload).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("shows hosted credits and accepts the exact quoted payer without a dollar fallback", async () => {
    const creditQuote = paymentQuote({
      charge: {
        value: "2",
        certainty: "estimate",
        unit: { kind: "credits", key: "credits", singular: "Credit", plural: "Credits" },
      },
      wallet: {
        available: {
          value: "50",
          certainty: "measured",
          unit: { kind: "credits", key: "credits", singular: "Credit", plural: "Credits" },
        },
        canAddCredits: true,
      },
    });
    creditQuote.option = { ...creditQuote.option, fundingSource: "platform" };
    const action = vi.fn<ExtendSnapshotAction>().mockResolvedValue({ ok: true });
    render(
      <SnapshotExtensionControl
        {...props}
        extension={extension}
        action={action}
        previewAction={async () => ({
          ok: true,
          payment: creditQuote,
          paymentOptions: [creditQuote.option],
        })}
        onReload={async () => undefined}
      />,
    );
    await open();
    expect(screen.getByRole("dialog")).toHaveTextContent("≈ 2 Credits");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("$");
    await act(async () => confirm());
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentOptionId: creditQuote.option.id,
        acceptedPayment: { quoteToken: creditQuote.quoteToken },
      }),
    );
  });
  it("rechecks the fixed deadline at confirmation", async () => {
    const action = vi.fn();
    render(
      <SnapshotExtensionControl
        {...props}
        extension={extension}
        action={action}
        onReload={async () => undefined}
      />,
    );
    await open();
    await act(async () => vi.advanceTimersByTimeAsync(13 * 60 * 1000));
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("This price expired.");
  });
  it("reloads after an ambiguous request and prevents a blind paid retry", async () => {
    const action = vi
      .fn<ExtendSnapshotAction>()
      .mockRejectedValue(new Error("private provider details"));
    const onReload = vi.fn(async () => undefined);
    render(
      <SnapshotExtensionControl
        {...props}
        extension={extension}
        action={action}
        onReload={onReload}
      />,
    );
    await open();
    await act(async () => confirm());
    expect(onReload).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveTextContent("extension could not be confirmed");
    expect(screen.queryByText(/private provider/)).toBeNull();
    expect(screen.getByRole("button", { name: /^Fetch next 10 results/ })).toBeDisabled();
  });
  it("keeps the blocked action visible and never re-enables an ambiguous page after a stale refresh", async () => {
    const action = vi.fn<ExtendSnapshotAction>().mockRejectedValue(new Error("uncertain"));
    const onReload = vi.fn(async () => undefined);
    render(
      <SnapshotExtensionControl
        {...props}
        extension={extension}
        action={action}
        onReload={onReload}
      />,
    );
    await open();
    await act(async () => confirm());

    expect(screen.getByRole("button", { name: /^Fetch next 10 results/ })).toBeDisabled();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Refresh snapshot" })),
    );
    expect(onReload).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: /^Fetch next 10 results/ })).toBeDisabled();
    expect(action).toHaveBeenCalledOnce();
  });
  it.each(["failed", "running"] as const)(
    "shows the disabled action with a persistent %s status",
    (reason) => {
      render(
        <SnapshotExtensionControl
          {...props}
          extension={{ ...extension, reason }}
          action={vi.fn()}
          onReload={async () => undefined}
        />,
      );
      expect(screen.getByRole("button", { name: /^Fetch next 10 results/ })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Refresh snapshot" })).toBeEnabled();
    },
  );
  it.each(["unsupported", "legacy", "expired", "complete", "disconnected"] as const)(
    "offers no paid action for %s",
    (reason) => {
      render(
        <SnapshotExtensionControl
          {...props}
          extension={{ ...extension, reason }}
          action={vi.fn()}
          onReload={async () => undefined}
        />,
      );
      expect(screen.queryByRole("button", { name: /^Fetch next 10 results/ })).toBeNull();
    },
  );
  it("refreshes stored results without requesting another provider page", async () => {
    const action = vi.fn();
    const onReload = vi.fn(async () => undefined);
    render(
      <SnapshotExtensionControl
        {...props}
        extension={{ ...extension, reason: "running" }}
        action={action}
        onReload={onReload}
      />,
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Refresh snapshot" })),
    );
    expect(onReload).toHaveBeenCalledOnce();
    expect(action).not.toHaveBeenCalled();
  });
  it("honors the project write hold", () => {
    render(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="migration_hold">
        <SnapshotExtensionControl
          {...props}
          extension={extension}
          action={vi.fn()}
          onReload={async () => undefined}
        />
      </ProjectWriteModeProvider>,
    );
    expect(screen.getByRole("button", { name: /^Fetch next 10 results/ })).toBeDisabled();
  });
});
