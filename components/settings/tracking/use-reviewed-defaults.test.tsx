import type { ProjectDefaultsInput } from "@/lib/schemas/project";
import { projectDefaultsSchema } from "@/lib/schemas/project";
import type { DefaultsPreview, DefaultsReview } from "@/lib/settings/reviewed-defaults-contract";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useReviewedDefaults } from "./use-reviewed-defaults";

const values = projectDefaultsSchema.parse({
  projectId: `prj_${"a".repeat(24)}`,
  country: "United States",
  device: "desktop",
  locationKey: "US",
  frequency: "daily",
  timezone: "UTC",
  jitterMinutes: 0,
  serpDepth: 100,
  serpStopOnMatch: false,
});
function fixture() {
  const preview = vi.fn(async (input: ProjectDefaultsInput): Promise<DefaultsPreview> => {
    const draft = projectDefaultsSchema.parse(input);
    return {
      request: { kind: "form", values: draft },
      draft,
      expectedRevision: "9007199254740993123",
      expectedSourceHash: "a".repeat(64),
      previewToken: "synthetic-opaque-preview",
      expiresAt: "2029-10-13T00:10:00Z",
      resolved: {
        locationKey: "US",
        label: "United States",
        languageCode: "en",
        device: draft.device,
      },
      impact: {
        existingTargetRetargets: 0,
        newTargets: 0,
        inheritedDepthTargets: 2,
        recurringEstimate: "unknown",
        scopeChanged: false,
        cadenceChanged: true,
      },
      policyReady: true,
    };
  });
  const save = vi.fn(async (_input: ProjectDefaultsInput, _review?: DefaultsReview) => ({
    ...values,
    kind: "saved",
  }));
  return { preview, save };
}
describe("reviewed defaults UI command boundary", () => {
  it("never reports success without an installed save port", async () => {
    const f = fixture(),
      { result } = renderHook(() => useReviewedDefaults(f.preview, undefined));
    await act(async () => {
      await expect(result.current.submit(values)).rejects.toMatchObject({
        code: "save_unavailable",
      });
    });
    expect(f.preview).not.toHaveBeenCalled();
    expect(result.current.savedValue).toBeNull();
  });
  it("previews and requires explicit acknowledgement before the only save", async () => {
    const f = fixture(),
      { result } = renderHook(() => useReviewedDefaults(f.preview, f.save));
    await act(async () => {
      expect(await result.current.submit(values)).toBe("review");
    });
    await act(async () => {
      expect(await result.current.submit(values)).toBe("review");
    });
    expect(f.save).not.toHaveBeenCalled();
    act(() => result.current.setAcknowledged(true));
    await act(async () => {
      expect(await result.current.submit(values)).toBe("saved");
    });
    expect(f.save).toHaveBeenCalledOnce();
    expect(f.save.mock.calls[0]).toEqual([
      values,
      expect.objectContaining({ confirmed: true, expectedRevision: "9007199254740993123" }),
    ]);
  });
  it("never approves the old review after a visible depth/stop/cadence edit", async () => {
    const f = fixture(),
      { result } = renderHook(() => useReviewedDefaults(f.preview, f.save));
    await act(async () => {
      await result.current.submit(values);
    });
    act(() => result.current.setAcknowledged(true));
    await act(async () => {
      expect(
        await result.current.submit({
          ...values,
          serpDepth: 20,
          serpStopOnMatch: true,
          frequency: "paused",
        }),
      ).toBe("review");
    });
    expect(result.current.acknowledged).toBe(false);
    expect(f.preview).toHaveBeenCalledTimes(2);
    expect(f.save).not.toHaveBeenCalled();
  });
  it("locks an ambiguous save and retries the identical command/key even after draft edits", async () => {
    const f = fixture();
    f.save.mockRejectedValueOnce(new Error("synthetic response loss"));
    const { result } = renderHook(() => useReviewedDefaults(f.preview, f.save));
    await act(async () => {
      await result.current.submit(values);
    });
    act(() => result.current.setAcknowledged(true));
    await act(async () => {
      await expect(result.current.submit(values)).rejects.toThrow("response loss");
    });
    expect(result.current.locked).toBe(true);
    const first = structuredClone(f.save.mock.calls[0]);
    await act(async () => {
      await result.current.submit({ ...values, serpDepth: 20 });
    });
    expect(f.save.mock.calls[1]).toEqual(first);
    expect(f.preview).toHaveBeenCalledOnce();
    expect(result.current.locked).toBe(false);
  });
  it("clears a definitively refused command for fresh review instead of claiming success", async () => {
    const f = fixture();
    const save = vi.fn(async () => ({ kind: "not_saved", code: "settings_conflict" }));
    const { result } = renderHook(() => useReviewedDefaults(f.preview, save));
    await act(async () => {
      await result.current.submit(values);
    });
    act(() => result.current.setAcknowledged(true));
    await act(async () => {
      await expect(result.current.submit(values)).rejects.toMatchObject({
        code: "settings_conflict",
      });
    });
    expect(result.current.locked).toBe(false);
    expect(result.current.quote).toBeNull();
  });
});
