import { expect, test } from "vitest";
import { recoveryNotice } from "./recovery-notification-policy";

const now = new Date("2026-10-13T10:00:00Z");
const current = { fingerprint: "cases:closed-cause", active: true };
const previous = { ...current, notifiedAt: now.toISOString() };
test("unchanged incidents notify once, then only in the daily digest", () => {
  expect(recoveryNotice(null, current, now)).toBe("new");
  expect(recoveryNotice(previous, current, new Date(now.getTime() + 60000))).toBeNull();
  expect(recoveryNotice(previous, current, new Date(now.getTime() + 86400000))).toBe("digest");
});
test("new evidence or a changed cause re-alerts immediately and resolution is explicit", () => {
  expect(recoveryNotice(previous, { ...current, fingerprint: "new-case" }, now)).toBe("changed");
  expect(recoveryNotice(previous, { fingerprint: "empty", active: false }, now)).toBe("resolved");
  expect(recoveryNotice(null, { fingerprint: "empty", active: false }, now)).toBeNull();
  expect(recoveryNotice({ ...previous, active: false }, current, now)).toBe("new");
});
