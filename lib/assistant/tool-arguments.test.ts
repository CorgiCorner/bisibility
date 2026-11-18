import { expect, test } from "vitest";
import { assistantArgsHash, bindAssistantToolArgs } from "./tool-arguments";
import { safeAssistantToolResult } from "./tool-results";

test("scope ids are server-bound and the hash is canonical", () => {
  const a = bindAssistantToolArgs(
    { project_id: "prj_forged", actorId: "other", nested: { wallet_id: "wallet", z: 1, a: 2 } },
    "prj_real",
  );
  const b = bindAssistantToolArgs({ nested: { a: 2, z: 1 }, project_id: "other" }, "prj_real");
  expect(a).toEqual({ nested: { a: 2, z: 1 }, project_id: "prj_real" });
  expect(assistantArgsHash(a)).toBe(assistantArgsHash(b));
  expect(assistantArgsHash(a)).not.toBe(assistantArgsHash(bindAssistantToolArgs({}, "prj_real")));
});
test("tool data removes secrets and raw HTML before entering the prompt", () => {
  expect(
    safeAssistantToolResult({
      token: "secret",
      api_key: "key",
      nested: { password: "secret", html: "<div>untrusted</div>", text: "hello" },
    }),
  ).toEqual({ nested: { html: "[HTML omitted]", text: "hello" } });
});
