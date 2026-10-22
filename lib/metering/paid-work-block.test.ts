import { expect, it } from "vitest";
import { selectPaidWorkBlocked } from "./paid-work-block";

const open = (id: string) => ({ connection: { id }, blocked: false as boolean | null });
const closed = (id: string) => ({ connection: { id }, blocked: true as boolean | null });

it("blocks an unsplit project when any scanned connection is blocked", () => {
  expect(
    selectPaidWorkBlocked({
      split: false,
      primaryConnectionId: "own",
      connectionCount: 2,
      connectionLimit: 20,
      statuses: [closed("hosted"), open("own")],
    }),
  ).toBe(true);
});

it("keeps an unsplit project unknown when the scan is truncated or a reading is unknown", () => {
  expect(
    selectPaidWorkBlocked({
      split: false,
      primaryConnectionId: null,
      connectionCount: 21,
      connectionLimit: 20,
      statuses: [open("own")],
    }),
  ).toBeNull();
  expect(
    selectPaidWorkBlocked({
      split: false,
      primaryConnectionId: null,
      connectionCount: 1,
      connectionLimit: 20,
      statuses: [{ connection: { id: "own" }, blocked: null }],
    }),
  ).toBeNull();
});

it("follows only the primary SERP connection once a project is split", () => {
  const statuses = [closed("hosted"), open("own")];
  expect(
    selectPaidWorkBlocked({
      split: true,
      primaryConnectionId: "own",
      connectionCount: 21,
      connectionLimit: 20,
      statuses,
    }),
  ).toBe(false);
  expect(
    selectPaidWorkBlocked({
      split: true,
      primaryConnectionId: "hosted",
      connectionCount: 2,
      connectionLimit: 20,
      statuses,
    }),
  ).toBe(true);
});

it("stays unknown when the primary connection was not in the split scan", () => {
  expect(
    selectPaidWorkBlocked({
      split: true,
      primaryConnectionId: "missing",
      connectionCount: 1,
      connectionLimit: 20,
      statuses: [open("own")],
    }),
  ).toBeNull();
});
