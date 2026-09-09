import "@testing-library/jest-dom/vitest";
import "./vitest.setup.common";

// jsdom has no layout observer. Layout and animation contracts run in the browser project.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub;
}
