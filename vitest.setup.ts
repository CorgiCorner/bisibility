import "@testing-library/jest-dom/vitest";
import { FROZEN_NOW } from "@/tests/clock";
import { afterAll, beforeEach, vi } from "vitest";

vi.mock("next/navigation", () => import("@/tests/next-navigation"));

function resetSystemDate() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN_NOW);
}

resetSystemDate();
beforeEach(resetSystemDate);

afterAll(() => {
  vi.useRealTimers();
});
