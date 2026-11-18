import { composerFixture } from "@/lib/model-playground/composer-fixtures.test-support";
import type {
  ModelPlaygroundLaunchResult,
  ModelPlaygroundQuote,
} from "@/lib/model-playground/launch-service";
import { createFakeModelPlaygroundLaunchService } from "@/lib/model-playground/launch-service.fake.test-support";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useModelPlayground } from "./useModelPlayground";

const stateWrites = vi.hoisted(() => ({ unmounted: false, late: vi.fn() }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useState: (initial: unknown) => {
      const [value, setValue] = react.useState(initial);
      return [
        value,
        (next: unknown) => {
          if (stateWrites.unmounted) stateWrites.late();
          setValue(next);
        },
      ];
    },
  };
});
afterEach(() => {
  stateWrites.unmounted = false;
  stateWrites.late.mockClear();
});
it.each(["preview", "launch"])(
  "does not update React state when %s completes after unmount",
  async (phase) => {
    const fixture = composerFixture();
    const fake = createFakeModelPlaygroundLaunchService(fixture);
    let finish!: () => Promise<void>;
    let signal: AbortSignal | undefined;
    const service = {
      preview: vi.fn((...args: Parameters<typeof fake.preview>) =>
        phase === "preview"
          ? new Promise<ModelPlaygroundQuote>((resolve) => {
              signal = args[1];
              finish = async () =>
                resolve(await fake.preview(args[0], new AbortController().signal));
            })
          : fake.preview(...args),
      ),
      launch: vi.fn(
        () =>
          new Promise<ModelPlaygroundLaunchResult>((resolve) => {
            finish = async () => resolve({ runId: "late", columns: [] });
          }),
      ),
    };
    const h = renderHook(() =>
      useModelPlayground({ ...fixture, service, canRun: true, debounceMs: 1 }),
    );
    if (phase === "launch") {
      await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
      act(() => {
        void h.result.current.run();
      });
    } else await waitFor(() => expect(service.preview).toHaveBeenCalledOnce());
    h.unmount();
    stateWrites.unmounted = true;
    if (phase === "preview") expect(signal?.aborted).toBe(true);
    await act(finish);
    expect(stateWrites.late).not.toHaveBeenCalled();
  },
);
