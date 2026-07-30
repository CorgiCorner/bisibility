import { describe, expect, it } from "vitest";
import { ProviderAuthError } from "./auth-error";
import {
  classifyProviderFailure,
  ProviderConfigurationError,
  ProviderHttpError,
} from "./failure-class";

describe("classifyProviderFailure", () => {
  it.each([
    [new ProviderAuthError("google"), "auth"],
    [new ProviderConfigurationError("Invalid stored property."), "config_invalid"],
    [new TypeError("fetch failed"), "network"],
    [new ProviderHttpError(403), "provider_4xx"],
    [new ProviderHttpError(400, "Invalid property ID."), "config_invalid"],
    [new ProviderHttpError(404, "Property 123456789 not found."), "config_invalid"],
    [
      new ProviderHttpError(400, "Invalid value at 'property': Unable to parse property ID."),
      "config_invalid",
    ],
    [new ProviderHttpError(503), "provider_5xx"],
    [new Error("unexpected"), "unknown"],
  ])("classifies %s", (error, expected) => {
    expect(classifyProviderFailure(error)).toBe(expected);
  });
});
