import { describe, expect, it } from "vitest";
import { incidentAgeMinutes, incidentOpenTime } from "./evidence-model";

const openedAt = new Date("2026-10-20T10:00:00Z");
const linked = { kind: "linked", version: 1, createdAt: new Date("2026-10-20T10:01:00Z") };
describe("admin incident open transition", () => {
  it("uses the opening link rather than the latest transition", () => {
    expect(
      incidentOpenTime({
        openedAt,
        transitions: [
          linked,
          { kind: "linked", version: 3, createdAt: new Date("2026-10-24T09:00:00Z") },
          { kind: "count_change", version: 4, createdAt: new Date("2026-10-24T10:00:00Z") },
        ],
      }),
    ).toEqual(linked.createdAt);
  });
  it("uses the latest reopening and computes age from that UTC instant", () => {
    const reopened = new Date("2026-10-24T07:00:00Z");
    const actual = incidentOpenTime({
      openedAt,
      transitions: [
        linked,
        { kind: "reopened", version: 5, createdAt: reopened },
        { kind: "count_change", version: 6, createdAt: new Date("2026-10-24T07:59:00Z") },
      ],
    });
    expect(actual).toEqual(reopened);
    expect(incidentAgeMinutes(actual, new Date("2026-10-24T08:00:00Z"))).toBe(60);
  });
  it("falls back to openedAt when opening history is absent", () => {
    expect(incidentOpenTime({ openedAt, transitions: [] })).toEqual(openedAt);
  });
});
