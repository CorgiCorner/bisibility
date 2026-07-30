import type { KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { locationKeyHandler } from "./location-key-handler";
import type { LocationSuggestion } from "./location-picker-data";

const locations: LocationSuggestion[] = [
  {
    canonicalKey: "PL",
    cityName: null,
    countryCode: "PL",
    displayName: "Poland",
    id: "country:PL",
    kind: "country",
    regionName: null,
  },
  {
    canonicalKey: "city:warsaw",
    cityName: "Warsaw",
    countryCode: "PL",
    displayName: "Warsaw, Poland",
    id: "city:warsaw",
    kind: "city",
    regionName: null,
  },
];

function setup(overrides: Partial<Parameters<typeof locationKeyHandler>[0]> = {}) {
  let activeIndex = 0;
  const options = {
    activeOption: locations[0],
    clear: vi.fn(),
    draft: "pol",
    locations,
    selectOption: vi.fn(),
    setActiveIndex: vi.fn((update) => {
      activeIndex = typeof update === "function" ? update(activeIndex) : update;
    }),
    setDraft: vi.fn(),
    setExpanded: vi.fn(),
    ...overrides,
  };
  const event = (key: string) =>
    ({ key, preventDefault: vi.fn() }) as unknown as KeyboardEvent<HTMLInputElement>;
  return {
    event,
    getActiveIndex: () => activeIndex,
    handler: locationKeyHandler(options),
    options,
  };
}

describe("locationKeyHandler", () => {
  it("cycles down and wraps to the first suggestion", () => {
    const test = setup();
    const first = test.event("ArrowDown");
    test.handler(first);
    const second = test.event("ArrowDown");
    test.handler(second);

    expect(first.preventDefault).toHaveBeenCalledOnce();
    expect(test.options.setExpanded).toHaveBeenCalledWith(true);
    expect(test.getActiveIndex()).toBe(0);
  });

  it("cycles up, wraps, and handles an empty suggestion list", () => {
    const test = setup();
    test.handler(test.event("ArrowUp"));
    expect(test.getActiveIndex()).toBe(1);

    const empty = setup({ locations: [] });
    empty.handler(empty.event("ArrowDown"));
    empty.handler(empty.event("ArrowUp"));
    expect(empty.getActiveIndex()).toBe(-1);
  });

  it("selects the active option on Enter", () => {
    const test = setup();
    const event = test.event("Enter");
    test.handler(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(test.options.selectOption).toHaveBeenCalledWith(locations[0]);
  });

  it("prevents Enter for a free-form draft without selecting", () => {
    const test = setup({ activeOption: undefined });
    const event = test.event("Enter");
    test.handler(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(test.options.selectOption).not.toHaveBeenCalled();
  });

  it("clears and collapses the picker on Escape", () => {
    const test = setup();
    test.handler(test.event("Escape"));

    expect(test.options.clear).toHaveBeenCalledOnce();
    expect(test.options.setDraft).toHaveBeenCalledWith(null);
    expect(test.options.setExpanded).toHaveBeenCalledWith(false);
    expect(test.getActiveIndex()).toBe(-1);
  });

  it("ignores unrelated keys and Enter without a draft", () => {
    const test = setup({ activeOption: undefined, draft: null });
    const event = test.event("Tab");
    test.handler(event);
    test.handler(test.event("Enter"));

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(test.options.clear).not.toHaveBeenCalled();
    expect(test.options.selectOption).not.toHaveBeenCalled();
  });
});
