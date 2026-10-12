import {
  authFeatureTestMessages,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import type { RequestLoginCodeResult } from "@/lib/auth/request-login-code";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./LoginForm";

const mocks = vi.hoisted(() => ({ requestLoginCode: vi.fn(), reset: vi.fn() }));
vi.mock("@/lib/auth/request-login-code", () => ({ requestLoginCode: mocks.requestLoginCode }));
vi.mock("@/lib/verification/human-verification-client", () => ({
  useHumanVerification: () => ({ field: null, ok: true, token: null, reset: mocks.reset }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requestLoginCode.mockResolvedValue({ ok: true });
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderLogin(strict: boolean) {
  const form = <LoginForm dataResidencyMessage="" legalConsentLinks={null} />;
  return renderWithFeatureMessages(strict ? <StrictMode>{form}</StrictMode> : form, {
    messages: authFeatureTestMessages,
  });
}
async function submitEmail() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Send login code" }));
  });
}

describe("LoginForm async ownership", () => {
  it.each([false, true])(
    "cancels the active cooldown on unmount (StrictMode=%s)",
    async (strict) => {
      const setInterval = vi.spyOn(globalThis, "setInterval");
      const clearInterval = vi.spyOn(globalThis, "clearInterval");
      const { unmount } = renderLogin(strict);
      await submitEmail();
      expect(screen.getByLabelText("Code")).toBeInTheDocument();
      expect(setInterval).toHaveBeenCalledTimes(1);
      const timer = setInterval.mock.results[0].value;
      unmount();
      expect(clearInterval).toHaveBeenCalledWith(timer);
    },
  );

  it("does not start a cooldown or reset verification after a late login response", async () => {
    let resolve!: (value: RequestLoginCodeResult) => void;
    mocks.requestLoginCode.mockReturnValue(
      new Promise<RequestLoginCodeResult>((done) => {
        resolve = done;
      }),
    );
    const setInterval = vi.spyOn(globalThis, "setInterval");
    const { unmount } = renderLogin(false);
    await submitEmail();
    expect(mocks.requestLoginCode).toHaveBeenCalledOnce();
    unmount();
    await act(async () => {
      resolve({ ok: true });
    });
    expect(setInterval).not.toHaveBeenCalled();
    expect(mocks.reset).not.toHaveBeenCalled();
  });
});
