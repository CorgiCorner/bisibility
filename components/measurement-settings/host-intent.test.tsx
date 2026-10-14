import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { reviewedIntentCommand } from "./commands";
import type { MeasurementPorts } from "./contracts";
import {
  acceptMeasurementQuote,
  beginMeasurementDraft,
  defaultsIntentChanged,
  previewRequest,
  quoteBlock,
} from "./draft";
import {
  fixtureChoices,
  fixtureNow,
  fixturePermissions,
  fixtureProjectId,
  fixtureQuote,
  fixtureSnapshot,
} from "./test-fixtures";
import { useMeasurementActions } from "./use-measurement-actions";

const spec = { kind: "all", v: 1 } as const;
function setup() {
  const draft = beginMeasurementDraft({
    ...fixtureSnapshot,
    selection: { ...fixtureSnapshot.selection, depth: 50 },
  });
  const request = previewRequest(draft, fixtureProjectId, spec);
  const context = {
    choices: fixtureChoices,
    currentRevision: fixtureSnapshot.revision,
    currentSourceHash: fixtureSnapshot.sourceHash,
    currentRateVersion: "synthetic-rate-v1",
    now: fixtureNow,
  };
  const reviewed = {
    ...acceptMeasurementQuote(draft, request, fixtureQuote(request)),
    acknowledgement: "intent" as const,
  };
  const ports: MeasurementPorts = {
    preview: vi.fn().mockResolvedValue({ kind: "ready", value: fixtureQuote(request) }),
    launch: vi.fn(),
    saveSchedule: vi.fn(),
    saveIntent: vi.fn().mockResolvedValue({ kind: "saved", value: fixtureSnapshot }),
  };
  const options = {
    request,
    permissions: fixturePermissions,
    ports,
    onQuote: vi.fn(),
    onInvalidate: vi.fn(),
    onStarted: vi.fn(),
    onScheduleResult: vi.fn(),
    onBusyChange: vi.fn(),
  };
  return {
    reviewed,
    request,
    context,
    options,
    ports,
    command: reviewedIntentCommand(reviewed, request, context)!,
  };
}
describe("explicit persisted defaults AUTHORED_NOT_RUN", () => {
  it("distinguishes selected schedule depth from stored project intent and detects equal-revision source drift", () => {
    const f = setup();
    expect(defaultsIntentChanged(f.reviewed)).toBe(true);
    expect(f.command.selection.depth).toBe(50);
    expect(f.command).not.toHaveProperty("providerId");
    expect(
      quoteBlock(
        f.reviewed,
        f.request,
        fixtureChoices,
        4,
        fixtureNow,
        "intent",
        "synthetic-rate-v1",
        "c".repeat(64),
      ),
    ).toBe("settings_conflict");
  });
  it("mount/edit never calls a write; lost save response retains exact original key and blocks manual/schedule/preview", async () => {
    const f = setup();
    vi.mocked(f.ports.saveIntent).mockRejectedValueOnce(
      new Error("Synthetic infrastructure response loss"),
    );
    const hook = renderHook(() => useMeasurementActions(f.options));
    hook.rerender();
    expect(f.ports.saveIntent).not.toHaveBeenCalled();
    await act(async () => {
      await hook.result.current.saveIntent(f.command);
    });
    expect(hook.result.current.state.phase).toBe("intent_unknown");
    expect(hook.result.current.locked).toBe(true);
    const first = vi.mocked(f.ports.saveIntent).mock.calls[0][0];
    await act(async () => {
      await hook.result.current.preview();
      await hook.result.current.launch();
      await hook.result.current.saveSchedule();
    });
    expect(f.ports.preview).not.toHaveBeenCalled();
    expect(f.ports.launch).not.toHaveBeenCalled();
    expect(f.ports.saveSchedule).not.toHaveBeenCalled();
    await act(async () => {
      await hook.result.current.saveIntent();
    });
    expect(vi.mocked(f.ports.saveIntent).mock.calls[1][0]).toEqual(first);
    expect(hook.result.current.locked).toBe(false);
    expect(f.options.onBusyChange).toHaveBeenLastCalledWith(false);
  });
  it("fresh authority refusal after an unknown response cannot falsely claim the original save did not commit", async () => {
    const f = setup();
    vi.mocked(f.ports.saveIntent).mockRejectedValueOnce(new Error("Synthetic lost response"));
    vi.mocked(f.ports.saveIntent).mockResolvedValueOnce({ kind: "unconfirmed", code: "forbidden" });
    const hook = renderHook(() => useMeasurementActions(f.options));
    await act(async () => {
      await hook.result.current.saveIntent(f.command);
    });
    await act(async () => {
      await hook.result.current.saveIntent();
    });
    expect(hook.result.current.locked).toBe(true);
    expect(hook.result.current.state).toEqual({ phase: "intent_unknown", code: "forbidden" });
    expect(vi.mocked(f.ports.saveIntent).mock.calls[1][0]).toEqual(
      vi.mocked(f.ports.saveIntent).mock.calls[0][0],
    );
  });
  it("viewer/revoked write role cannot submit or recover a settings operation", async () => {
    const f = setup();
    const hook = renderHook(() =>
      useMeasurementActions({
        ...f.options,
        permissions: { ...fixturePermissions, canWriteIntent: false },
      }),
    );
    await act(async () => {
      await hook.result.current.saveIntent(f.command);
    });
    expect(f.ports.saveIntent).not.toHaveBeenCalled();
  });
});
