import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BusinessCommandResult } from "./contracts";
import { useBusinessCommand } from "./use-business-command";

type Command = { idempotencyKey: string; value: string };
describe("business mutation UI lifecycle", () => {
  it("reuses the exact intent key after an ambiguous error, but changes it when the draft changes", async () => {
    const port = vi
      .fn<(command: Command) => Promise<BusinessCommandResult<string>>>()
      .mockRejectedValue(new Error("raw secret must not render"));
    const { result } = renderHook(() =>
      useBusinessCommand(port, (command, idempotencyKey) => ({ ...command, idempotencyKey })),
    );
    await act(async () => {
      await result.current.submit({ value: "first" });
    });
    expect(result.current.result).toEqual({ kind: "error" });
    await act(async () => {
      await result.current.submit({ value: "first" });
    });
    expect(port.mock.calls[1][0].idempotencyKey).toBe(port.mock.calls[0][0].idempotencyKey);
    await act(async () => {
      await result.current.submit({ value: "changed" });
    });
    expect(port.mock.calls[2][0].idempotencyKey).not.toBe(port.mock.calls[0][0].idempotencyKey);
  });
  it("synchronously fences a second submit while the first promise is unresolved", async () => {
    let finish!: (value: BusinessCommandResult<string>) => void;
    const port = vi.fn<(command: Command) => Promise<BusinessCommandResult<string>>>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() =>
      useBusinessCommand(port, (command, idempotencyKey) => ({ ...command, idempotencyKey })),
    );
    let first!: Promise<BusinessCommandResult<string> | null>;
    act(() => {
      first = result.current.submit({ value: "one" });
    });
    await act(async () => {
      expect(await result.current.submit({ value: "two" })).toBeNull();
    });
    expect(port).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ kind: "saved", value: "one" });
      await first;
    });
    expect(result.current.pending).toBe(false);
  });
  it("keeps an untyped thrown 409 unknown and never fabricates a revision conflict", async () => {
    const port = vi
      .fn<(command: Command) => Promise<BusinessCommandResult<string>>>()
      .mockRejectedValue({ status: 409, body: "private-record" });
    const { result } = renderHook(() =>
      useBusinessCommand(port, (command, idempotencyKey) => ({ ...command, idempotencyKey })),
    );
    await act(async () => {
      await result.current.submit({ value: "draft" });
    });
    expect(result.current.result).toEqual({ kind: "error" });
  });
});
