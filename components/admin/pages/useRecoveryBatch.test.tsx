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

const cases = [
  { reference: "ref-a", token: "case-a" },
  { reference: "ref-b", token: "case-b" },
];
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
        return useRecoveryBatch(
          {
            batch: params.batch ?? null,
            command: params.command ?? null,
            update: (next) => setParams((old) => ({ ...old, ...next })),
          },
          cases,
        );
      },
      { wrapper: Provider },
    );
    await act(async () => result.current.onPreview(["ref-a"]));
    await waitFor(() => expect(result.current.preview?.token).toBe("case-a"));
    const first = result.current.preview;
    if (!first) throw new Error("Missing prepared preview");
    await act(async () => {
      expect(await result.current.onConfirm(first)).toBe(false);
    });
    expect(m.status).not.toHaveBeenCalled();
    await act(async () => result.current.onClearPreview());
    await act(async () => result.current.onPreview(["ref-b"]));
    await waitFor(() => expect(result.current.preview?.token).toBe("case-b"));
    expect(m.preview).toHaveBeenCalledWith({ caseTokens: ["case-b"] });
    await act(async () => {
      expect(await result.current.onConfirm(first)).toBe(false);
    });
    expect(m.commit).toHaveBeenCalledTimes(1);
  },
);

function routed(loaded: { reference: string; token: string }[], initial: string | null = null) {
  return renderHook(
    () => {
      const [params, setParams] = useState<Record<string, string | undefined>>({
        batch: initial ?? undefined,
      });
      const batch = useRecoveryBatch(
        {
          batch: params.batch ?? null,
          command: params.command ?? null,
          update: (next) => setParams((old) => ({ ...old, ...next })),
        },
        loaded,
      );
      return { batch, params };
    },
    { wrapper: Provider },
  );
}

it("keeps case references in the URL and authorizes the preview with the loaded tokens", async () => {
  // The sizes a full batch has in production: 25 cases, 43-character references, sealed tokens.
  const loaded = Array.from({ length: 25 }, (_, index) => ({
    reference: `${index}`.padStart(43, "r"),
    token: `${index}`.padStart(306, "t"),
  }));
  const { result } = routed(loaded);
  await act(async () => result.current.batch.onPreview(loaded.map((item) => item.reference)));
  await waitFor(() => expect(m.preview).toHaveBeenCalled());
  for (const [input] of m.preview.mock.calls)
    expect(input).toEqual({ caseTokens: loaded.map((item) => item.token) });
  const batch = result.current.params.batch ?? "";
  expect(JSON.parse(batch)).toEqual(loaded.map((item) => item.reference));
  // Tokens made this parameter about 9 KB, above the 8 KB request line some proxies accept.
  expect(new URLSearchParams({ batch }).toString().length).toBeLessThan(2000);
});

it("previews a restored batch with the tokens of the current read and skips unloaded cases", async () => {
  const { result } = routed(cases, JSON.stringify(["ref-b", "ref-gone"]));
  await waitFor(() => expect(result.current.batch.preview?.token).toBe("case-b"));
  expect(m.preview).toHaveBeenCalledWith({ caseTokens: ["case-b"] });
});

it("does not send a batch parameter that holds anything but loaded references", async () => {
  const { result } = routed(cases, JSON.stringify(["case-a", "t".repeat(306)]));
  await waitFor(() => expect(result.current.batch.batchErrorCode).toBe("unavailable"));
  expect(m.preview).not.toHaveBeenCalled();
});
