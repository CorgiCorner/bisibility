import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isPendingFirstRunUser } from "./first-run-context";

const isPendingFirstRunUserAtRuntime = isPendingFirstRunUser as (
  userId: string | undefined,
) => boolean;

it("rejects a missing runtime user ID outside first-run creation", () => {
  expect(isPendingFirstRunUserAtRuntime(undefined)).toBe(false);
});
