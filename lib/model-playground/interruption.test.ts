import { expect, test } from "vitest";
import { result } from "./contract-fixtures.test-support";
import { modelObservation, readModelObservation } from "./interruption";

const interruption = {
  version: 1 as const,
  reason: "timeout" as const,
  requestBytes: 100,
  requestTokens: 40,
  reasoning: false,
  elapsedMs: 1000,
};
test("ordinary observations retain the existing stored shape", () => {
  const response = result();
  expect(modelObservation(response)).toBe(response);
  expect(readModelObservation(response)).toEqual({ response, interruption: undefined });
});
test("interrupted observations retain transport facts without changing the public answer", () => {
  const response = result();
  expect(readModelObservation(modelObservation(response, interruption))).toEqual({
    response,
    interruption,
  });
  expect(() => modelObservation(response, { ...interruption, requestTokens: -1 })).toThrow();
});

test("malformed never-called evidence cannot fall through to an estimated charge", () => {
  expect(() => readModelObservation({ kind: "not_called", result: result() })).toThrow(
    "Invalid retained never-called evidence",
  );
});
