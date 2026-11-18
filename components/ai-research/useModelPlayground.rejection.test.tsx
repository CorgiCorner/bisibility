import { composerFixture } from "@/lib/model-playground/composer-fixtures.test-support";
import type { ModelPlaygroundLaunchRejection } from "@/lib/model-playground/launch-service";
import { createFakeModelPlaygroundLaunchService } from "@/lib/model-playground/launch-service.fake.test-support";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useModelPlayground } from "./useModelPlayground";
import * as failureModel from "./useModelPlaygroundLifecycle";

const rejection: ModelPlaygroundLaunchRejection = {
  kind: "not_dispatched",
  message: "Permission refused before admission",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function setup(launchRejection?: ModelPlaygroundLaunchRejection) {
  const options = { ...composerFixture(), launchRejection };
  const service = createFakeModelPlaygroundLaunchService(options);
  const launch = vi.spyOn(service, "launch");
  const hook = renderHook(() =>
    useModelPlayground({ ...options, service, canRun: true, debounceMs: 1 }),
  );
  return { ...hook, options, launch };
}

it("allows a fresh launch without confirmation after a typed pre-admission rejection", async () => {
  const h = setup(rejection);
  await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
  await act(() => h.result.current.run());
  expect(h.result.current.failed).toBe(true);
  expect(h.result.current.canLaunch).toBe(true);
  try {
    h.options.launchRejection = undefined;
    await act(() => h.result.current.run());
    expect(h.result.current.confirmationOpen).toBe(false);
    expect(h.launch).toHaveBeenCalledTimes(2);
    expect(h.result.current.result).not.toBeNull();
    expect(h.result.current.canLaunch).toBe(false);
  } finally {
    h.options.launchRejection = rejection;
  }
});

it.each([
  new Error("Response lost"),
  new Error("Permission refused before admission"),
  { definite: true, message: "Unrecognised error shape" },
  { kind: "not_dispatched" },
  { kind: "invalid_request", message: "Safe refusal", reason: "unknown" },
])("keeps an untyped or malformed rejection uncertain: %j", async (error) => {
  const h = setup();
  h.launch.mockRejectedValueOnce(error);
  await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
  await act(() => h.result.current.run());
  expect(h.result.current.failed).toBe(true);
  await act(() => h.result.current.run());
  expect(h.result.current.confirmationOpen).toBe(true);
  expect(h.launch).toHaveBeenCalledOnce();
});

it.each(
  [
    {
      name: "first attempt definitely rejected",
      lost: false,
      edited: false,
      unmounted: false,
      failure: "not_dispatched",
      confirmation: false,
      fresh: true,
    },
    {
      name: "preserves earlier uncertainty when a confirmed retry is definitely rejected",
      lost: true,
      edited: false,
      unmounted: false,
      failure: "uncertain",
      confirmation: true,
      fresh: true,
    },
    {
      name: "definite rejection then content edited",
      lost: false,
      edited: true,
      unmounted: false,
      failure: null,
      confirmation: false,
      fresh: true,
    },
    {
      name: "rejection after unmount",
      lost: false,
      edited: false,
      unmounted: true,
      failure: null,
      confirmation: false,
      fresh: false,
    },
  ].flatMap((step) =>
    [rejection, { kind: "run_not_created" as const, message: "Run not created" }].map(
      (rejected) => ({ ...step, rejected }),
    ),
  ),
)(
  "$name ($rejected.kind)",
  async ({ lost, edited, unmounted, failure, confirmation, fresh, rejected }) => {
    vi.useFakeTimers();
    const errors = vi.spyOn(console, "error");
    const rejectState = vi.fn();
    const useFailure = failureModel.useModelPlaygroundFailure;
    vi.spyOn(failureModel, "useModelPlaygroundFailure").mockImplementation((key) => {
      const state = useFailure(key);
      return {
        ...state,
        rejectLaunch: (content: string, definite: boolean) => {
          rejectState(content, definite);
          state.rejectLaunch(content, definite);
        },
      };
    });
    const options = composerFixture();
    const service = createFakeModelPlaygroundLaunchService(options);
    const preview = vi.spyOn(service, "preview");
    const launch = vi.spyOn(service, "launch");
    const h = renderHook(() =>
      useModelPlayground({ ...options, service, canRun: true, debounceMs: 10 }),
    );
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(h.result.current.canLaunch).toBe(true);
    const oldQuote = h.result.current.quote?.previewId;
    if (lost) {
      launch.mockRejectedValueOnce(new Error("Response lost"));
      await act(() => h.result.current.run());
      expect(h.result.current.failure).toBe("uncertain");
      await act(() => h.result.current.run());
      expect(h.result.current.confirmationOpen).toBe(true);
    }
    const before = preview.mock.calls.length;
    const staleRun = h.result.current.run;
    if (unmounted) {
      let reject!: (error: unknown) => void;
      launch.mockImplementationOnce(
        () =>
          new Promise((_resolve, fail) => {
            reject = fail;
          }),
      );
      let pending!: Promise<void>;
      act(() => {
        pending = h.result.current.run();
      });
      h.unmount();
      await act(async () => {
        reject(rejected);
        await pending;
      });
      expect(rejectState).not.toHaveBeenCalled();
    } else {
      launch.mockRejectedValueOnce(rejected);
      await act(() => (lost ? h.result.current.confirmRetry() : h.result.current.run()));
      // Failure is also the banner selector: uncertain chooses runFailed; definite chooses runRejected.
      expect(h.result.current.failure).toBe(lost ? "uncertain" : "not_dispatched");
      expect(h.result.current.quote?.previewId).not.toBe(oldQuote);
      expect(h.result.current.quote).not.toBeNull();
      const attempts = launch.mock.calls.length;
      await act(() => staleRun());
      expect(launch).toHaveBeenCalledTimes(attempts);
      if (edited) {
        act(() =>
          h.result.current.form.setValue("prompt", "Edited question", { shouldDirty: true }),
        );
        await act(() => vi.advanceTimersByTimeAsync(10));
      }
      expect(h.result.current.failure).toBe(failure);
      await act(() => h.result.current.run());
      expect(h.result.current.confirmationOpen).toBe(confirmation);
      expect(launch).toHaveBeenCalledTimes(2);
      expect(launch.mock.calls[1][0].requestId).not.toBe(launch.mock.calls[0][0].requestId);
      if (!lost)
        expect(launch.mock.calls[1][0].previewId).not.toBe(launch.mock.calls[0][0].previewId);
    }
    expect(preview.mock.calls.length > before).toBe(fresh);
    h.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(errors).not.toHaveBeenCalled();
  },
);

it.each([new Error("Network lost"), { kind: "uncertain" }])(
  "settled launch failure clears provisional reads and offers confirmation: %j",
  async (error) => {
    const options = composerFixture();
    const service = createFakeModelPlaygroundLaunchService(options);
    service.read = vi.fn().mockResolvedValue(null);
    vi.spyOn(service, "launch").mockRejectedValueOnce(error);
    const h = renderHook(() =>
      useModelPlayground({ ...options, service, canRun: true, debounceMs: 1 }),
    );
    await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
    await act(() => h.result.current.run());
    expect(h.result.current.pending).toBe(false);
    expect(h.result.current.canLaunch).toBe(true);
    await act(() => h.result.current.run());
    expect(h.result.current.confirmationOpen).toBe(true);
    expect(service.launch).toHaveBeenCalledOnce();
  },
);

it.each(["access_denied", "feature_disabled", "invalid_request", "run_not_created"])(
  "%s is definite and never invents charge uncertainty",
  async (kind) => {
    const h = setup();
    h.launch.mockRejectedValueOnce({ kind, message: "Safe refusal", reason: "validation_failed" });
    await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
    await act(() => h.result.current.run());
    expect(h.result.current.failure).toBe("not_dispatched");
    expect(h.result.current.pending).toBe(false);
    await act(() => h.result.current.run());
    expect(h.result.current.confirmationOpen).toBe(false);
    expect(h.launch).toHaveBeenCalledTimes(2);
  },
);
