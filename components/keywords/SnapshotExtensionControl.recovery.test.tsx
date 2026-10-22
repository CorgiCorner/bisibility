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
const confirm = () => fireEvent.click(screen.getByRole("button", { name: "Start" }));

describe("server-proven snapshot extension recovery", () => {
  it("requires explicit confirmation for a server-proven not-sent extension", async () => {
    const action = vi.fn<ExtendSnapshotAction>().mockResolvedValue({ ok: true });
    render(
      <SnapshotExtensionControl
        {...props}
        extension={{ ...extension, reason: "not_sent" }}
        action={action}
        onReload={async () => undefined}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("This extension was not sent");
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /^Try extension again/ })),
    );
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent("≈ 1 search");
    await act(async () => confirm());
    expect(action).toHaveBeenCalledExactlyOnceWith({
      paymentOptionId: payment.option.id,
      acceptedPayment: { quoteToken: payment.quoteToken },
      checkId: props.checkId,
      projectId: props.projectRef,
      nextStart: 20,
    });
  });
  it("retains the known-not-sent explanation after the original deadline without offering a retry", () => {
    vi.setSystemTime(new Date(extension.expiresAt!));
    const action = vi.fn();
    render(
      <SnapshotExtensionControl
        {...props}
        extension={{ ...extension, reason: "not_sent" }}
        action={action}
        onReload={async () => undefined}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "This extension was not sent. The extension window has closed.",
    );
    expect(screen.getByRole("button", { name: /^Try extension again/ })).toBeDisabled();
    expect(action).not.toHaveBeenCalled();
  });
  it("does not reuse stale not-sent props after a new ambiguous retry", async () => {
    const action = vi.fn<ExtendSnapshotAction>().mockRejectedValue(new Error("uncertain"));
    const onReload = vi.fn(async () => undefined);
    render(
      <SnapshotExtensionControl
        {...props}
        extension={{ ...extension, reason: "not_sent" }}
        action={action}
        onReload={onReload}
      />,
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /^Try extension again/ })),
    );
    await act(async () => confirm());

    expect(screen.getByRole("button", { name: /^Fetch next 10 results/ })).toBeDisabled();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Refresh snapshot" })),
    );
    expect(screen.getByRole("button", { name: /^Fetch next 10 results/ })).toBeDisabled();
    expect(action).toHaveBeenCalledOnce();
  });
  it("clears a local unknown hold only after a fresh matching not-sent proof read, without retrying", async () => {
    const notSent = { ...extension, reason: "not_sent" as const };
    const action = vi.fn<ExtendSnapshotAction>().mockRejectedValue(new Error("uncertain"));
    const onReload = vi
      .fn<() => Promise<SnapshotExtensionView | void>>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(notSent);
    render(
      <SnapshotExtensionControl
        {...props}
        extension={notSent}
        action={action}
        onReload={onReload}
      />,
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /^Try extension again/ })),
    );
    await act(async () => confirm());

    expect(screen.getByRole("button", { name: /^Fetch next 10 results/ })).toBeDisabled();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Refresh snapshot" })),
    );
    expect(screen.getByRole("button", { name: /^Try extension again/ })).toBeEnabled();
    expect(action).toHaveBeenCalledOnce();
  });

  it.each([
    { nextStart: 30, expiresAt: extension.expiresAt },
    { nextStart: 20, expiresAt: "2026-09-28T10:16:00.000Z" },
  ])(
    "does not clear an unknown hold from a proof for another cursor/window: %j",
    async (mismatch) => {
      const notSent = { ...extension, reason: "not_sent" as const };
      const action = vi.fn<ExtendSnapshotAction>().mockRejectedValue(new Error("uncertain"));
      const onReload = vi
        .fn<() => Promise<SnapshotExtensionView | void>>()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ ...notSent, ...mismatch });
      render(
        <SnapshotExtensionControl
          {...props}
          extension={notSent}
          action={action}
          onReload={onReload}
        />,
      );
      await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: /^Try extension again/ })),
      );
      await act(async () => confirm());

      await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Refresh snapshot" })),
      );
      expect(screen.getByRole("button", { name: /^Fetch next 10 results/ })).toBeDisabled();
      expect(action).toHaveBeenCalledOnce();
    },
  );
  it("rechecks the original deadline after a not-sent retry confirmation opens", async () => {
    const action = vi.fn();
    render(
      <SnapshotExtensionControl
        {...props}
        extension={{ ...extension, reason: "not_sent" }}
        action={action}
        onReload={async () => undefined}
      />,
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: /^Try extension again/ })),
    );
    await act(async () => vi.advanceTimersByTimeAsync(13 * 60 * 1000));
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    expect(screen.getByRole("button", { name: "Refresh price" })).toBeEnabled();
    expect(action).not.toHaveBeenCalled();
  });
  it("keeps a server-proven not-sent retry disabled on a read-only project", () => {
    render(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="migration_hold">
        <SnapshotExtensionControl
          {...props}
          extension={{ ...extension, reason: "not_sent" }}
          action={vi.fn()}
          onReload={async () => undefined}
        />
      </ProjectWriteModeProvider>,
    );
    expect(screen.getByRole("button", { name: /^Try extension again/ })).toBeDisabled();
  });
});
