import { emptyTablePresentation } from "@/lib/saved-views/presentation-model";
import { describe, expect, it } from "vitest";
import {
  clearPersonalLayoutCache,
  personalLayoutCacheKey,
  readPersonalLayoutCache,
  writePersonalLayoutCache,
} from "./layout-cache";

function storageFixture() {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
describe("personal layout cache identity", () => {
  it("does not inherit an old account/project/surface layout and clears only its own namespace on logout", () => {
    const storage = storageFixture();
    const identity = { projectId: "project-a", surface: "keywords" as const, userId: "user-a" };
    const layout = { ...emptyTablePresentation, visibility: { volume: false } };
    storage.setItem("legacy-global-layout", "leave-unimported");
    expect(writePersonalLayoutCache(storage, identity, layout)).toBe(true);
    expect(readPersonalLayoutCache(storage, identity)).toEqual(layout);
    expect(readPersonalLayoutCache(storage, { ...identity, userId: "user-b" })).toBeNull();
    expect(readPersonalLayoutCache(storage, { ...identity, projectId: "project-b" })).toBeNull();
    expect(readPersonalLayoutCache(storage, { ...identity, surface: "competitors" })).toBeNull();
    clearPersonalLayoutCache(storage);
    expect(readPersonalLayoutCache(storage, identity)).toBeNull();
    expect(storage.getItem("legacy-global-layout")).toBe("leave-unimported");
  });
  it("ignores malformed cache and rejects non-layout payloads", () => {
    const storage = storageFixture();
    const identity = { projectId: "project-a", surface: "keywords" as const, userId: "user-a" };
    storage.setItem(personalLayoutCacheKey(identity), "{");
    expect(readPersonalLayoutCache(storage, identity)).toBeNull();
    expect(
      writePersonalLayoutCache(storage, identity, {
        ...emptyTablePresentation,
        credentials: "never-cache",
      }),
    ).toBe(false);
  });
});
