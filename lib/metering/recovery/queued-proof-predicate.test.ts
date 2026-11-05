import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("uses the shared own-key queued tag proof instead of a credential-segment match", () => {
  const source = readFileSync(new URL("./query.ts", import.meta.url), "utf8");
  expect(source).toContain("queuedOwnTagProofSql");
  expect(source).not.toContain(`providerTag" LIKE '%;cs=own;%'`);
});
