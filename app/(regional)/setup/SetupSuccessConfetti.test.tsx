import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetupSuccessConfetti } from "./SetupSuccessConfetti";

const fire = vi.hoisted(() => {
  const burst = vi.fn();
  return Object.assign(burst, { reset: vi.fn() });
});

vi.mock("canvas-confetti", () => ({ default: fire }));

describe("SetupSuccessConfetti", () => {
  afterEach(() => {
    cleanup();
    fire.mockClear();
    fire.reset.mockClear();
    vi.unstubAllGlobals();
  });

  it("fires side cannons from both viewport edges", async () => {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );

    render(<SetupSuccessConfetti />);

    await vi.waitFor(() => expect(fire).toHaveBeenCalled());
    const left = fire.mock.calls.find(([options]) => options.angle === 60)?.[0];
    const right = fire.mock.calls.find(([options]) => options.angle === 120)?.[0];
    expect(left.origin).toMatchObject({ x: 0 });
    expect(right.origin).toMatchObject({ x: 1 });
    expect(left.origin.y).toBeGreaterThanOrEqual(0.15);
    expect(left.origin.y).toBeLessThanOrEqual(0.85);
    expect(right.origin.y).toBe(left.origin.y);
  });

  it("stays quiet when motion is reduced", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );

    render(<SetupSuccessConfetti />);
    await Promise.resolve();

    expect(fire).not.toHaveBeenCalled();
  });
});
