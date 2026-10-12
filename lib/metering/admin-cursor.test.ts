import { expect, it } from "vitest";
import { openAdminCursor, sealAdminCursor } from "./admin-cursor";

const scope = { actor: "admin1", month: "2026-09", project: "p" };
it("encrypts storage cursors and binds them to the verified actor, filters and table", () => {
  const token = sealAdminCursor(
    "private-storage-cursor",
    scope,
    "exceptions",
    "2026-10-11T12:00:00Z",
  );
  expect(token).not.toContain("private-storage-cursor");
  expect(openAdminCursor(token ?? undefined, scope, "exceptions")).toMatchObject({
    cursor: "private-storage-cursor",
  });
  for (const changed of [{ actor: "admin2" }, { month: "2026-10" }, { project: null }])
    expect(() =>
      openAdminCursor(token ?? undefined, { ...scope, ...changed }, "exceptions"),
    ).toThrow("Invalid metering cursor");
  expect(() => openAdminCursor(token ?? undefined, scope, "usage")).toThrow(
    "Invalid metering cursor",
  );
});
