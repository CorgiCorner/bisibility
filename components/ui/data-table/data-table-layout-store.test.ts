import { describe, expect, it, vi } from "vitest";
import { createDataTableLayoutStore } from "./data-table-layout-store";

function memoryStorage(seed?: string) {
  let value = seed ?? null;
  return {
    getItem: vi.fn(() => value),
    removeItem: vi.fn(() => {
      value = null;
    }),
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    }),
  };
}

describe("data table layout store", () => {
  it("keeps the server snapshot at defaults and hydrates persisted layout", () => {
    const storage = memoryStorage(
      JSON.stringify({ columnSizing: { keyword: 240 }, columnVisibility: { volume: false } }),
    );
    const store = createDataTableLayoutStore("keywords", () => storage);

    expect(store.getServerSnapshot()).toEqual({ columnSizing: {}, columnVisibility: {} });
    expect(store.getSnapshot()).toEqual({
      columnSizing: { keyword: 240 },
      columnVisibility: { volume: false },
    });
  });

  it("persists updates and removes the versioned key on reset", () => {
    const storage = memoryStorage();
    const store = createDataTableLayoutStore("markets", () => storage);
    store.setColumnSizing({ keyword: 212 });
    store.setColumnVisibility({ volume: false });
    expect(storage.setItem).toHaveBeenLastCalledWith(
      "bv:data-table:markets:v1",
      JSON.stringify({ columnSizing: { keyword: 212 }, columnVisibility: { volume: false } }),
    );
    store.reset();
    expect(storage.removeItem).toHaveBeenCalledWith("bv:data-table:markets:v1");
  });

  it("keeps working when private-mode storage throws", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("denied");
      }),
      removeItem: vi.fn(() => {
        throw new Error("denied");
      }),
      setItem: vi.fn(() => {
        throw new Error("denied");
      }),
    };
    const store = createDataTableLayoutStore("private", () => storage);
    expect(() => store.setColumnSizing({ keyword: 200 })).not.toThrow();
    expect(store.getSnapshot().columnSizing).toEqual({ keyword: 200 });
    expect(() => store.reset()).not.toThrow();
  });
});
