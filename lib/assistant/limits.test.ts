import { expect, test } from "vitest";
import {
  assistantOutputLimitChoices,
  resolveAssistantOutputLimit,
  runAssistantOutputLimit,
} from "./limits";

const model = { maxOutputTokens: 8192 };

test("a per-turn output cap above the model maximum is rejected, never lowered", () => {
  expect(resolveAssistantOutputLimit(model, 8193)).toBeUndefined();
  expect(resolveAssistantOutputLimit(model, 0)).toBeUndefined();
  expect(resolveAssistantOutputLimit(model, 1.5)).toBeUndefined();
  expect(resolveAssistantOutputLimit(model, 4096)).toBe(4096);
  expect(resolveAssistantOutputLimit(model, 8192)).toBe(8192);
  expect(resolveAssistantOutputLimit(model, undefined)).toBe(8192);
});

test("a stored cap never exceeds a lowered catalog maximum", () => {
  expect(runAssistantOutputLimit(model, 4096)).toBe(4096);
  expect(runAssistantOutputLimit({ maxOutputTokens: 2048 }, 4096)).toBe(2048);
  expect(runAssistantOutputLimit(model, null)).toBe(8192);
});

test("the composer offers fixed caps below the model maximum, then the maximum", () => {
  expect(assistantOutputLimitChoices(8192)).toEqual([1024, 4096, 8192]);
  expect(assistantOutputLimitChoices(64000)).toEqual([1024, 4096, 16384, 64000]);
  expect(assistantOutputLimitChoices(1024)).toEqual([1024]);
});
