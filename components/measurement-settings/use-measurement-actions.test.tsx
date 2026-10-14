import { requirePublicId } from "@/lib/db/public-id";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MeasurementPorts, PaidLaunchCommand, PreviewRequest } from "./contracts";
import { beginMeasurementDraft, previewRequest } from "./draft";
import {
  fixturePermissions,
  fixtureProjectId,
  fixtureQuote,
  fixtureSnapshot,
  fixtureSpec,
} from "./test-fixtures";
import { useMeasurementActions } from "./use-measurement-actions";

function context() {
  const request = previewRequest(
    beginMeasurementDraft(fixtureSnapshot),
    fixtureProjectId,
    fixtureSpec,
  );
  const ports: MeasurementPorts = {
    preview: vi.fn().mockResolvedValue({ kind: "ready", value: fixtureQuote(request) }),
    launch: vi.fn().mockResolvedValue({
      publicId: "run_synthetic",
      status: "queued",
      keywordCount: 20,
      targetCount: 20,
      estimatedCostCents: 2,
    }),
    saveIntent: vi.fn(async () => ({ kind: "saved" as const, value: fixtureSnapshot })),
    saveSchedule: vi
      .fn()
      .mockResolvedValue({ kind: "saved", value: { ...fixtureSnapshot, revision: 5 } }),
  };
  return {
    request,
    ports,
    permissions: fixturePermissions,
    onQuote: vi.fn(),
    onInvalidate: vi.fn(),
    onStarted: vi.fn(),
    onScheduleResult: vi.fn(),
  };
}
function manual(request: PreviewRequest): Omit<PaidLaunchCommand, "idempotencyKey"> {
  return {
    projectId: requirePublicId(request.projectId, "prj"),
    spec: request.spec,
    depth: 20,
    providerId: "dataforseo",
    previewToken: "synthetic-opaque-token-not-a-real-signature",
    expectedRevision: request.expectedRevision,
    expectedSourceHash: request.expectedSourceHash,
    scheduleId: request.scheduleId,
    measurementToken: "synthetic-measurement-token",
    intent: request.selection,
    capabilityVersion: request.selection.capabilityVersion,
    confirmed: true,
  };
}
describe("injected action ports never execute on mount/read/display", () => {
  it("does nothing on mount/rerender; an explicit preview calls only the readonly port", async () => {
    const input = context();
    const hook = renderHook(() => useMeasurementActions(input));
    hook.rerender();
    expect(input.ports.preview).not.toHaveBeenCalled();
    expect(input.ports.launch).not.toHaveBeenCalled();
    expect(input.ports.saveSchedule).not.toHaveBeenCalled();
    await act(async () => {
      await hook.result.current.preview();
    });
    expect(input.ports.preview).toHaveBeenCalledOnce();
    expect(input.ports.launch).not.toHaveBeenCalled();
    expect(input.ports.saveSchedule).not.toHaveBeenCalled();
  });
  it("preserves an unknown launch's exact key/payload and blocks new preview or schedule intent", async () => {
    const input = context();
    vi.mocked(input.ports.launch).mockRejectedValueOnce(new Error("raw-private-error"));
    const hook = renderHook(() => useMeasurementActions(input));
    await act(async () => {
      await hook.result.current.launch(manual(input.request));
    });
    expect(hook.result.current.state.phase).toBe("launch_unknown");
    expect(hook.result.current.locked).toBe(true);
    const first = vi.mocked(input.ports.launch).mock.calls[0][0];
    await act(async () => {
      await hook.result.current.preview();
      await hook.result.current.saveSchedule();
    });
    expect(input.ports.preview).not.toHaveBeenCalled();
    expect(input.ports.saveSchedule).not.toHaveBeenCalled();
    await act(async () => {
      await hook.result.current.launch({ ...manual(input.request), depth: 50 });
    });
    expect(vi.mocked(input.ports.launch).mock.calls[1][0]).toEqual(first);
    expect(input.onStarted).toHaveBeenCalledOnce();
  });
  it("requires an explicit fresh preview after a definitive preview mismatch, without automatic retry", async () => {
    const input = context();
    vi.mocked(input.ports.launch).mockResolvedValue({
      status: "not_started",
      code: "preview_mismatch",
      message: "not rendered",
    });
    const hook = renderHook(() => useMeasurementActions(input));
    await act(async () => {
      await hook.result.current.launch(manual(input.request));
    });
    expect(hook.result.current.state).toEqual({ phase: "blocked", code: "preview_mismatch" });
    expect(hook.result.current.locked).toBe(false);
    expect(input.onInvalidate).toHaveBeenCalledOnce();
    expect(input.ports.preview).not.toHaveBeenCalled();
    expect(input.ports.launch).toHaveBeenCalledOnce();
  });
  it("fences concurrent launch synchronously and never dispatches a schedule from a launch", async () => {
    const input = context();
    let finish!: (value: Awaited<ReturnType<MeasurementPorts["launch"]>>) => void;
    vi.mocked(input.ports.launch).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const hook = renderHook(() => useMeasurementActions(input));
    let first!: Promise<void>;
    act(() => {
      first = hook.result.current.launch(manual(input.request));
    });
    await act(async () => {
      await hook.result.current.launch(manual(input.request));
    });
    expect(input.ports.launch).toHaveBeenCalledOnce();
    await act(async () => {
      finish({
        publicId: "run_synthetic",
        status: "queued",
        keywordCount: 20,
        targetCount: 20,
        estimatedCostCents: 2,
      });
      await first;
    });
    expect(input.ports.saveSchedule).not.toHaveBeenCalled();
  });
  it("discards a preview response after the controlled scope changed while reading", async () => {
    const input = context();
    let finish!: (value: Awaited<ReturnType<MeasurementPorts["preview"]>>) => void;
    vi.mocked(input.ports.preview).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const hook = renderHook((value) => useMeasurementActions(value), { initialProps: input });
    let reading!: Promise<void>;
    act(() => {
      reading = hook.result.current.preview();
    });
    hook.rerender({
      ...input,
      request: { ...input.request, selection: { ...input.request.selection, depth: 50 } },
    });
    await act(async () => {
      finish({ kind: "ready", value: fixtureQuote(input.request) });
      await reading;
    });
    expect(input.onQuote).not.toHaveBeenCalled();
    expect(input.ports.launch).not.toHaveBeenCalled();
  });
  it("recovers an ambiguous schedule save with the same command/key, never launching", async () => {
    const input = context();
    vi.mocked(input.ports.saveSchedule).mockRejectedValueOnce(new Error("network unknown"));
    const hook = renderHook(() => useMeasurementActions(input));
    await act(async () => {
      await hook.result.current.saveSchedule({
        projectId: fixtureProjectId,
        expectedRevision: 4,
        expectedSourceHash: fixtureSnapshot.sourceHash,
        previewToken: "synthetic-token",
        selection: fixtureSnapshot.selection,
        scheduleId: fixtureSnapshot.scheduleId!,
        schedule: fixtureSnapshot.schedule!,
        confirmed: true,
      });
    });
    expect(hook.result.current.state.phase).toBe("schedule_unknown");
    const first = vi.mocked(input.ports.saveSchedule).mock.calls[0][0];
    await act(async () => {
      await hook.result.current.saveSchedule();
    });
    expect(vi.mocked(input.ports.saveSchedule).mock.calls[1][0]).toEqual(first);
    expect(input.ports.launch).not.toHaveBeenCalled();
  });
  it("handles a proved no-save validation response without making its draft permanently uneditable", async () => {
    const input = context();
    vi.mocked(input.ports.saveSchedule).mockResolvedValue({
      kind: "not_saved",
      code: "invalid_settings",
    });
    const hook = renderHook(() => useMeasurementActions(input));
    await act(async () => {
      await hook.result.current.saveSchedule({
        projectId: fixtureProjectId,
        expectedRevision: 4,
        expectedSourceHash: fixtureSnapshot.sourceHash,
        previewToken: "synthetic-token",
        selection: fixtureSnapshot.selection,
        scheduleId: fixtureSnapshot.scheduleId!,
        schedule: fixtureSnapshot.schedule!,
        confirmed: true,
      });
    });
    expect(hook.result.current.state).toEqual({ phase: "blocked", code: "invalid_settings" });
    expect(hook.result.current.locked).toBe(false);
    expect(input.ports.launch).not.toHaveBeenCalled();
  });
  it("never converts a host callback failure after a proved launch into an unknown provider outcome", async () => {
    const input = context();
    input.onStarted.mockImplementation(() => {
      throw new Error("host callback failed");
    });
    const hook = renderHook(() => useMeasurementActions(input));
    await act(async () => {
      await expect(hook.result.current.launch(manual(input.request))).rejects.toThrow(
        "host callback failed",
      );
    });
    expect(hook.result.current.state.phase).toBe("started");
    expect(hook.result.current.locked).toBe(false);
    expect(input.ports.launch).toHaveBeenCalledOnce();
  });
});
