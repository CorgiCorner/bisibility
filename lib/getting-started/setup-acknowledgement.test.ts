import { describe, expect, it } from "vitest";
import {
  addSetupAcknowledgement,
  isSetupAcknowledged,
  parseSetupAcknowledgements,
  serializeSetupAcknowledgements,
} from "./setup-acknowledgement";

const projectA = "prj_abcdefghijklmnopqrstuvwx";
const projectB = "prj_bcdefghijklmnopqrstuvwxy";

describe("setup acknowledgement cookie", () => {
  it("survives a second server render for the same user and project", () => {
    const cookie = serializeSetupAcknowledgements(addSetupAcknowledgement([], "user-1", projectA));
    expect(isSetupAcknowledged(cookie, "user-1", projectA)).toBe(true);
    expect(isSetupAcknowledged(cookie, "user-1", projectA)).toBe(true);
  });

  it("rejects a tampered acknowledgement", () => {
    const cookie = serializeSetupAcknowledgements(addSetupAcknowledgement([], "user-1", projectA));
    expect(isSetupAcknowledged(`${cookie}x`, "user-1", projectA)).toBe(false);
  });

  it("isolates acknowledgement by project and user", () => {
    const cookie = serializeSetupAcknowledgements(addSetupAcknowledgement([], "user-1", projectA));
    expect(isSetupAcknowledged(cookie, "user-1", projectB)).toBe(false);
    expect(isSetupAcknowledged(cookie, "user-2", projectA)).toBe(false);
  });

  it("keeps a bounded set of valid project acknowledgements", () => {
    let entries = [] as ReturnType<typeof parseSetupAcknowledgements>;
    for (let index = 0; index < 60; index += 1) {
      const suffix = `a${index.toString(36).padStart(23, "0")}`;
      entries = addSetupAcknowledgement(entries, "user-1", `prj_${suffix}`);
    }
    const cookie = serializeSetupAcknowledgements(entries);
    expect(cookie.length).toBeLessThan(3800);
    expect(parseSetupAcknowledgements(cookie).length).toBeGreaterThanOrEqual(30);
    expect(isSetupAcknowledged(cookie, "user-1", "prj_a0000000000000000000001n")).toBe(true);
  });
});
