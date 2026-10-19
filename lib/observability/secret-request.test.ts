import { expect, it } from "vitest";
import { redactRequestSecrets, secretBearingRequest } from "./secret-request";

it("redacts credential query strings and request bodies from every telemetry channel", () => {
  const result = redactRequestSecrets({
    breadcrumbs: [{ data: { url: "https://serpapi.com/account.json?api_key=secret&x=1" } }],
    request: { data: { password: "private", apiKey: "private" } },
  });
  expect(JSON.stringify(result)).not.toContain("secret&");
  expect(JSON.stringify(result)).not.toContain("private");
  expect(secretBearingRequest("https://serpapi.com/account.json?api_key=secret")).toBe(true);
});

it("redacts standalone query attributes and API key headers", () => {
  const value = redactRequestSecrets({
    "url.query": "api_key=private-value&engine=google",
    "http.query": "token=private-value",
    "x-api-key": "private-value",
  });
  expect(JSON.stringify(value)).not.toContain("private-value");
});
