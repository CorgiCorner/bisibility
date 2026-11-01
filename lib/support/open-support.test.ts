// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { openSupport, subscribeOpenSupport } from "./open-support";

describe("openSupport", () => {
  it("delivers the request to subscribers until they unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeOpenSupport(listener);

    openSupport({ message: "Raise my project limit" });
    openSupport();
    unsubscribe();
    openSupport({ message: "ignored" });

    expect(listener.mock.calls).toEqual([[{ message: "Raise my project limit" }], [{}]]);
  });
});
