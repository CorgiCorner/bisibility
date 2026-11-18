import { expect, test } from "vitest";
import { providerOrigin } from "./request-origin";

test("native session provider origin carries no programmatic credential", () => {
  expect(
    providerOrigin({ surface: "app", source: "app", credentialKind: null, credentialId: null }),
  ).toEqual({ source: "app" });
  expect(
    providerOrigin({
      surface: "programmatic",
      source: "mcp",
      credentialKind: "personal_token",
      credentialId: "token-id",
    }),
  ).toEqual({ source: "mcp", credential: { kind: "personal_token", id: "token-id" } });
});
