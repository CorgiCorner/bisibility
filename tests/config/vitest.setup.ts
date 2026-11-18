import "@testing-library/jest-dom/vitest";
import "./vitest.setup.common";
import { vi } from "vitest";

// DOM fixtures never invoke authenticated server actions. Review scenarios override this port.
vi.mock(
  "@/lib/schedules/preview-client",
  () => import("@/.storybook/schedule-review-action-stubs"),
);

import { CompressionStream, DecompressionStream, ReadableStream } from "node:stream/web";

globalThis.CompressionStream ??= CompressionStream as typeof globalThis.CompressionStream;
globalThis.DecompressionStream ??= DecompressionStream as typeof globalThis.DecompressionStream;
globalThis.ReadableStream ??= ReadableStream as typeof globalThis.ReadableStream;

// jsdom has no layout observer. Layout and animation contracts run in the browser project.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub;
}
