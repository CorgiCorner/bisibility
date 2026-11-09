import { act, renderHook, waitFor } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useRecoveryBatch } from "./useRecoveryBatch";

const m = vi.hoisted(() => ({ preview: vi.fn(), commit: vi.fn(), status: vi.fn() }));
vi.mock("@/lib/actions/metering-recovery", () => ({
  previewRecoveryAction: m.preview,
  commitRecoveryAction: m.commit,
  getRecoveryCommandAction: m.status,
}));
const preview = {
  token: "preview-a",
  expiresAt: "2099-01-01T00:00:00Z",
  eligible: [],
  excluded: [],
  newPaidAttempts: 0,
  providerCalls: 0,
  originalRuns: 0,
};
beforeEach(() => {
  vi.resetAllMocks();
  m.preview.mockImplementation(async ({ caseTokens }: { caseTokens: string[] }) => ({
    ok: true,
    value: { ...preview, token: caseTokens[0] },
  }));
});

import { FeatureMessagesProvider } from "@/i18n/FeatureMessagesProvider";
import { instanceAdminFeatureTestMessages as messages } from "@/i18n/test-support/feature-test-messages";

const Provider = ({ children }: { children: ReactNode }) => (
  <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
    {children}
  </FeatureMessagesProvider>
);

it.each(["case_changed", "rate_limited", "two_factor_required", "forbidden", "invalid"])(
  "P2-R1 invalidates a definitive %s rejection and permits another selection after close",
  async (code) => {
    m.commit.mockResolvedValue({ ok: false, code });
    const { result } = renderHook(
      () => {
        const [params, setParams] = useState<Record<string, string | undefined>>({});
        return useRecoveryBatch({
          batch: params.batch ?? null,
          command: params.command ?? null,
          update: (next) => setParams((old) => ({ ...old, ...next })),
        });
      },
      { wrapper: Provider },
    );
    await act(async () => result.current.onPreview(["case-a"]));
    await waitFor(() => expect(result.current.preview?.token).toBe("case-a"));
    const first = result.current.preview;
    if (!first) throw new Error("Missing prepared preview");
    await act(async () => {
      expect(await result.current.onConfirm(first)).toBe(false);
    });
    expect(m.status).not.toHaveBeenCalled();
    await act(async () => result.current.onClearPreview());
    await act(async () => result.current.onPreview(["case-b"]));
    await waitFor(() => expect(result.current.preview?.token).toBe("case-b"));
    expect(m.preview).toHaveBeenCalledWith({ caseTokens: ["case-b"] });
    await act(async () => {
      expect(await result.current.onConfirm(first)).toBe(false);
    });
    expect(m.commit).toHaveBeenCalledTimes(1);
  },
);
