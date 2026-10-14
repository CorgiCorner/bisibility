import { beforeEach, expect, it, vi } from "vitest";
import { createReportCursorCodec } from "./cursor";
import { RankReportCursorError } from "./errors";
import { hostRankReportCursorCodec } from "./host-cursor";

const keys = vi.hoisted(() => vi.fn());
vi.mock("@/lib/providers/crypto", () => ({ getPurposeSecretKeys: keys }));
const primary = Buffer.alloc(32, 17);
const retired = Buffer.alloc(32, 31);
const payload = {
  asOf: "2026-10-12T12:00:00.000Z",
  binding: "a".repeat(64),
  source: "b".repeat(64),
  last: { at: "2026-10-12T10:00:00.000Z", id: "check_fixture" },
  version: 1 as const,
};
beforeEach(() => {
  keys.mockReset();
  keys.mockReturnValue([primary, retired]);
});
it("signs with the host primary and reads a retained-key cursor during rotation", () => {
  const codec = hostRankReportCursorCodec();
  expect(keys).toHaveBeenCalledWith("bisibility:rank-report:host-cursor:v1");
  expect(createReportCursorCodec(primary).decode(codec.encode(payload))).toEqual(payload);
  expect(codec.decode(createReportCursorCodec(retired).encode(payload))).toEqual(payload);
});
it("rejects an unretained key and any changed cursor body", () => {
  const codec = hostRankReportCursorCodec();
  expect(() => codec.decode(createReportCursorCodec(Buffer.alloc(32, 59)).encode(payload))).toThrow(
    RankReportCursorError,
  );
  const token = codec.encode(payload);
  expect(() => codec.decode(`x${token}`)).toThrow(RankReportCursorError);
});
it("refuses an absent host keyring instead of choosing a client or temporary signing key", () => {
  keys.mockReturnValue([]);
  expect(() => hostRankReportCursorCodec()).toThrow("keyring is unavailable");
});
