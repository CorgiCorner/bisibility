import { composerFixture } from "@/lib/model-playground/composer-fixtures.test-support";
import { result as columnResult } from "@/lib/model-playground/contract-fixtures.test-support";
import { createFakeModelPlaygroundLaunchService } from "@/lib/model-playground/launch-service.fake.test-support";
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useModelPlayground } from "./useModelPlayground";

it.each(["success", "rejection", "throw"])("keeps the paid answer on autosave %s", async (kind) => {
  const fixture = composerFixture();
  const service = createFakeModelPlaygroundLaunchService({
    ...fixture,
    result: { runId: crypto.randomUUID(), columns: [columnResult()] },
  });
  const save = vi.fn(() => {
    if (kind === "throw") throw new Error("supplementary failure");
    return kind === "rejection" ? Promise.reject(new Error("storage")) : Promise.resolve();
  });
  const launch = vi.spyOn(service, "launch");
  const hook = renderHook(() =>
    useModelPlayground({ ...fixture, canRun: true, service, debounceMs: 1, onRetainedRun: save }),
  );
  await waitFor(() => expect(hook.result.current.canLaunch).toBe(true));
  await act(() => hook.result.current.run());
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save).toHaveBeenCalledWith(hook.result.current.result?.runId);
  expect(hook.result.current.failure).toBe(null);
  expect(hook.result.current.result?.columns[0].answer).toBe("An answer with two citations.");
  await act(() => hook.result.current.run());
  expect(launch).toHaveBeenCalledTimes(1);
});
