import type { ChartMarkerKind } from "@/lib/annotations/marker-style";
import { describe, expect, it, vi } from "vitest";
import {
  chartMarkerPreferenceKey,
  createChartMarkerPreferenceStore,
  defaultChartMarkerPreference,
  markersForPreference,
} from "./chart-marker-preference";

function memoryStorage(seed?: string) {
  let value = seed ?? null;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    }),
  };
}

const projectId = "prj_abcdefghijklmnopqrstuvwx";

describe("chart marker preference", () => {
  it("round-trips a per-project choice through storage", () => {
    const storage = memoryStorage();
    const store = createChartMarkerPreferenceStore(projectId, () => storage);
    expect(store.getServerSnapshot()).toEqual(defaultChartMarkerPreference);
    expect(store.getSnapshot().enabled).toBe(true);

    store.toggleKind("deploy");
    store.setEnabled(false);
    const saved = storage.setItem.mock.lastCall?.[1];
    expect(storage.setItem).toHaveBeenCalledWith(chartMarkerPreferenceKey(projectId), saved);

    const restored = createChartMarkerPreferenceStore(projectId, () => storage);
    expect(restored.getSnapshot()).toEqual({
      enabled: false,
      kinds: { ...defaultChartMarkerPreference.kinds, deploy: false },
    });
    const noteHidden = {
      ...defaultChartMarkerPreference,
      kinds: { ...defaultChartMarkerPreference.kinds, note: false },
    };
    expect(
      markersForPreference(
        [
          { dateKey: "2026-11-02", id: "deploy", kind: "deploy", title: "Ship" },
          { dateKey: "2026-11-03", id: "note", kind: "note", title: "FAQ" },
        ],
        noteHidden,
      ).map((marker) => marker.id),
    ).toEqual(["deploy"]);
    expect(
      markersForPreference(
        [{ dateKey: "2026-11-02", id: "note", kind: "note" as ChartMarkerKind, title: "FAQ" }],
        restored.getSnapshot(),
      ),
    ).toEqual([]);
  });
});
