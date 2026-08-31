import type { HumanVerificationState } from "@/lib/verification/human-verification-client";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OtpResendControl } from "./OtpResendControl";

const mocks = vi.hoisted(() => ({ reset: vi.fn(), useHumanVerification: vi.fn() }));
vi.mock("@/lib/verification/human-verification-client", () => ({
  useHumanVerification: mocks.useHumanVerification,
}));

function useRequiredVerification(): HumanVerificationState {
  const [token, setToken] = useState<string | null>(null);
  return {
    field: (
      <button
        onClick={() => setToken((current) => (current ? `${current}-fresh` : "token-1"))}
        type="button"
      >
        Complete challenge
      </button>
    ),
    ok: token !== null,
    reset: () => {
      mocks.reset();
      setToken(null);
    },
    token,
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("OtpResendControl concurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useHumanVerification.mockImplementation(useRequiredVerification);
  });

  it("starts once for rapid clicks and allows a fresh token after completion", async () => {
    const first = deferred();
    const second = deferred();
    const onResend = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    render(
      <OtpResendControl
        cooldownRemaining={0}
        humanVerificationRequired
        onResend={onResend}
        resentCode={false}
        submitting={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Complete challenge" }));
    const resend = screen.getByRole("button", { name: "Resend code" });
    fireEvent.click(resend);
    fireEvent.click(resend);

    expect(onResend).toHaveBeenCalledOnce();
    expect(onResend).toHaveBeenCalledWith("token-1");
    expect(resend).toBeDisabled();

    await act(async () => first.resolve());
    await waitFor(() => expect(mocks.reset).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Resend code" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Complete challenge" }));
    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));
    expect(onResend).toHaveBeenCalledTimes(2);
    expect(onResend).toHaveBeenLastCalledWith("token-1");

    await act(async () => second.resolve());
  });

  it("keeps self-host tokenless while preventing rapid re-entry", async () => {
    const request = deferred();
    const onResend = vi.fn(() => request.promise);
    render(
      <OtpResendControl
        cooldownRemaining={0}
        humanVerificationRequired={false}
        onResend={onResend}
        resentCode={false}
        submitting={false}
      />,
    );

    const resend = screen.getByRole("button", { name: "Resend code" });
    fireEvent.click(resend);
    fireEvent.click(resend);
    expect(onResend).toHaveBeenCalledOnce();
    expect(onResend).toHaveBeenCalledWith(undefined);
    await act(async () => request.resolve());
  });
});
