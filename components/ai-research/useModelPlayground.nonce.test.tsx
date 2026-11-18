import { composerFixture } from "@/lib/model-playground/composer-fixtures.test-support";
import { createFakeModelPlaygroundLaunchService } from "@/lib/model-playground/launch-service.fake.test-support";
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useModelPlayground } from "./useModelPlayground";

function setup() {
  const fixture = composerFixture();
  const service = createFakeModelPlaygroundLaunchService(fixture);
  const launch = vi.spyOn(service, "launch");
  const hook = renderHook(() =>
    useModelPlayground({ ...fixture, service, canRun: true, debounceMs: 1 }),
  );
  return { ...hook, launch };
}
const confirmation = {
  kind: "confirmation_required",
  nonce: "11111111-1111-4111-8111-111111111111",
  contentHash: "a".repeat(64),
  attemptIds: ["earlier:1", "earlier:2"],
  earlierAttemptUnconfirmed: true,
};

test("server nonce and exact unknown set only travel after visible explicit confirmation", async () => {
  const h = setup();
  h.launch.mockRejectedValueOnce(confirmation).mockResolvedValue({ runId: "run", columns: [] });
  await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
  await act(() => h.result.current.run());
  expect(h.result.current.confirmationOpen).toBe(true);
  expect(h.launch.mock.calls[0][0]).not.toHaveProperty("confirmUnknown");
  await act(() => h.result.current.confirmRetry());
  expect(h.launch).toHaveBeenCalledTimes(2);
  expect(h.launch.mock.calls[1][0].confirmUnknown).toEqual({
    nonce: confirmation.nonce,
    contentHash: confirmation.contentHash,
    attemptIds: confirmation.attemptIds,
  });
});

test("browser uncertainty confirmation never invents a server nonce", async () => {
  const h = setup();
  h.launch
    .mockRejectedValueOnce(new Error("Connection lost"))
    .mockResolvedValue({ runId: "run", columns: [] });
  await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
  await act(() => h.result.current.run());
  await act(() => h.result.current.run());
  await act(() => h.result.current.confirmRetry());
  expect(h.launch).toHaveBeenCalledTimes(2);
  expect(h.launch.mock.calls[1][0]).not.toHaveProperty("confirmUnknown");
});

test("editing the draft cannot send a stale confirmation", async () => {
  const h = setup();
  h.launch.mockRejectedValueOnce(confirmation).mockResolvedValue({ runId: "run", columns: [] });
  await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
  await act(() => h.result.current.run());
  const staleConfirm = h.result.current.confirmRetry;
  act(() => h.result.current.form.setValue("prompt", "A changed prompt"));
  await act(staleConfirm);
  expect(h.launch).toHaveBeenCalledOnce();
  await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
  await act(() => h.result.current.run());
  expect(h.launch.mock.calls[1][0]).not.toHaveProperty("confirmUnknown");
});

test("server search default stays on when the initial route cannot search", () => {
  const fixture = composerFixture();
  fixture.input.columns = [fixture.input.columns[1]];
  const service = createFakeModelPlaygroundLaunchService(fixture);
  const hook = renderHook(() =>
    useModelPlayground({ ...fixture, service, canRun: true, searchByDefault: true }),
  );
  expect(hook.result.current.search).toBe(true);
  expect(hook.result.current.unsupportedSearch).toEqual([fixture.input.columns[0].columnId]);
  hook.unmount();
});

test("a lost response releases pending reads and requires confirmation without resending", async () => {
  const fixture = composerFixture();
  const service = Object.assign(createFakeModelPlaygroundLaunchService(fixture), {
    read: vi.fn().mockResolvedValue(null),
  });
  const launch = vi.spyOn(service, "launch").mockRejectedValue(new Error("Lost response"));
  const h = renderHook(() =>
    useModelPlayground({ ...fixture, service, canRun: true, debounceMs: 1 }),
  );
  await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
  await act(() => h.result.current.run());
  expect(h.result.current.pending).toBe(false);
  await act(() => h.result.current.run());
  expect(h.result.current.confirmationOpen).toBe(true);
  expect(launch).toHaveBeenCalledOnce();
  h.unmount();
});
