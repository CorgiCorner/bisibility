import { expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { decodeAffectedCursor } from "./checks";

it("binds pagination to the connection and refuses malformed cursors", () => {
  const value = { connection: "own", at: "2026-10-28T10:00:00.000Z", id: "check_1" };
  const cursor = Buffer.from(JSON.stringify(value)).toString("base64url");
  expect(decodeAffectedCursor(cursor, "own")).toEqual(value);
  expect(() => decodeAffectedCursor(cursor, "foreign")).toThrow("another connection");
  for (const bad of [
    "%",
    "a".repeat(513),
    Buffer.from('{"connection":"own"}').toString("base64url"),
  ])
    expect(() => decodeAffectedCursor(bad, "own")).toThrow();
});
