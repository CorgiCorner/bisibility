import { APICallError } from "@ai-sdk/provider";
import { expect, test } from "vitest";
import { keyRejectionOf } from "./key-rejection";

const error = (statusCode: number | undefined, body?: unknown) =>
  new APICallError({
    message: "refused",
    url: "https://api.example.com/v1",
    requestBodyValues: {},
    statusCode,
    responseBody: body === undefined ? undefined : JSON.stringify(body),
    isRetryable: false,
  });

test.each([
  ["openai", 401, undefined, "invalid_key"],
  ["anthropic", 403, undefined, "no_permission"],
  ["openai", 429, { error: { code: "insufficient_quota" } }, "quota_exhausted"],
  ["openai", 429, { error: { code: "project_spend_limit_exceeded" } }, "quota_exhausted"],
  ["openai", 429, { error: { type: "insufficient_quota" } }, "quota_exhausted"],
  ["openai", 429, { error: { code: "rate_limit_exceeded" } }, null],
  ["openai", 402, undefined, null],
  ["anthropic", 402, undefined, "quota_exhausted"],
  [
    "anthropic",
    400,
    { error: { type: "invalid_request_error", message: "Your credit balance is too low" } },
    "quota_exhausted",
  ],
  ["anthropic", 400, { error: { type: "invalid_request_error", message: "bad tool" } }, null],
  ["anthropic", 429, undefined, null],
  ["openrouter", 402, undefined, "quota_exhausted"],
  ["openrouter", 500, undefined, null],
  ["openai", 503, undefined, null],
  ["openai", 408, undefined, null],
] as const)("%s HTTP %i is %s", (provider, status, body, expected) => {
  expect(keyRejectionOf(error(status, body), provider)).toBe(expected);
});

test("a non-HTTP failure is never a key refusal", () => {
  expect(keyRejectionOf(new TypeError("fetch failed"), "openai")).toBeNull();
  expect(keyRejectionOf(error(undefined), "openai")).toBeNull();
  expect(keyRejectionOf(new Error("Provider stream error"), "anthropic")).toBeNull();
});
