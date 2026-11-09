import { expect, it } from "vitest";
import { isOauthExchangeRequest } from "./oauth-exchange-request";

it.each([
  ["POST", ["me", "tokens"], "Bearer oauth-fixture", true],
  ["POST", ["me", "tokens"], "bEaReR oauth-fixture", true],
  ["GET", ["me", "tokens"], "Bearer oauth-fixture", false],
  ["POST", ["me", "tokens", "extra"], "Bearer oauth-fixture", false],
  ["POST", ["me"], "Bearer oauth-fixture", false],
  ["POST", ["me", "tokens"], "", false],
  ["POST", ["me", "tokens"], "Bearer bsb_pat_live_fixture", false],
  ["POST", ["me", "tokens"], "Bearer bsb_key_fixture", false],
  ["POST", ["me", "tokens"], "Bearer bsk_fixture", false],
  ["POST", ["me", "tokens"], "Bearer bsp_fixture", false],
])("recognizes OAuth token exchange %s %j (%s)", (method, path, authorization, expected) => {
  const req = new Request("https://example.test/api/v1/me/tokens", {
    headers: { authorization },
    method,
  });
  expect(isOauthExchangeRequest(method, path, req)).toBe(expected);
});
