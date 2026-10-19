import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { ApiInputError } from "./errors";
import {
  decodeCursor,
  decodeOffsetCursor,
  decodeUnprefixedCursor,
  encodeCursor,
  encodeOffsetCursor,
  encodeUnprefixedCursor,
  paginateArray,
  parsePageQuery,
} from "./pagination";

function expectInvalidCursor(callback: () => unknown) {
  expect(callback).toThrow(ApiInputError);
  try {
    callback();
  } catch (error) {
    expect((error as ApiInputError).code).toBe("invalid_cursor");
  }
}

describe("v3 API cursors", () => {
  it("encodes a versioned cursor with a public ID only", () => {
    const cursor = encodeCursor(
      {
        publicId: "kw_a00000000000000000000000",
        timestamp: new Date("2026-07-27T12:00:00.000Z"),
      },
      "kw",
    );

    expect(decodeCursor(cursor, "kw")).toEqual({
      public_id: "kw_a00000000000000000000000",
      t: "2026-07-27T12:00:00.000Z",
      v: 3,
    });
  });

  it("rejects legacy raw-ID and unversioned cursor payloads with a stable code", () => {
    const legacy = Buffer.from(
      JSON.stringify({ id: "keyword_db_1", t: "2026-07-27T12:00:00.000Z" }),
    ).toString("base64url");

    expectInvalidCursor(() => decodeCursor(legacy, "kw"));
    const url = new URL(`https://api.example.com?cursor=${legacy}`);
    expectInvalidCursor(() => paginateArray(url, ["one"]));
  });

  it("rejects raw and wrong-prefix v3 cursor IDs before a query is built", () => {
    const rawCursor = Buffer.from(
      JSON.stringify({ public_id: "keyword_db_1", t: "2026-07-27T12:00:00.000Z", v: 3 }),
    ).toString("base64url");
    const wrongPrefixCursor = Buffer.from(
      JSON.stringify({
        public_id: "prj_a00000000000000000000000",
        t: "2026-07-27T12:00:00.000Z",
        v: 3,
      }),
    ).toString("base64url");

    expectInvalidCursor(() => decodeCursor(rawCursor, "kw"));
    expectInvalidCursor(() => decodeCursor(wrongPrefixCursor, "kw"));
    expect(() =>
      encodeCursor(
        {
          publicId: "prj_a00000000000000000000000",
          timestamp: new Date("2026-07-27T12:00:00.000Z"),
        },
        "kw",
      ),
    ).toThrow("unexpected public ID");
  });

  it("rejects extra legacy or raw fields in both v3 cursor shapes", () => {
    const cursorWithLegacyId = Buffer.from(
      JSON.stringify({
        id: "keyword_db_1",
        public_id: "kw_a00000000000000000000000",
        t: "2026-07-27T12:00:00.000Z",
        v: 3,
      }),
    ).toString("base64url");
    const offsetWithRawId = Buffer.from(JSON.stringify({ id: "row_db_1", o: 1, v: 3 })).toString(
      "base64url",
    );

    expectInvalidCursor(() => decodeCursor(cursorWithLegacyId, "kw"));
    expectInvalidCursor(() =>
      paginateArray(new URL(`https://api.example.com?cursor=${offsetWithRawId}`), ["one", "two"]),
    );
  });

  it("keeps keyset and offset cursor shapes separate and strict", () => {
    const offset = encodeOffsetCursor(50);
    const keyset = encodeCursor(
      {
        publicId: "kw_a00000000000000000000000",
        timestamp: new Date("2026-07-27T12:00:00.000Z"),
      },
      "kw",
    );

    expect(decodeOffsetCursor(offset)).toBe(50);
    expectInvalidCursor(() => decodeOffsetCursor(keyset));
    expectInvalidCursor(() => decodeCursor(offset, "kw"));
    expectInvalidCursor(() =>
      decodeOffsetCursor(Buffer.from(JSON.stringify({ o: 50, v: 1 })).toString("base64url")),
    );
  });

  it("rejects v3 keyset and offset cursors", () => {
    const keyset = Buffer.from(
      JSON.stringify({
        public_id: "kw_a00000000000000000000000",
        t: "2026-07-27T12:00:00.000Z",
        v: 2,
      }),
    ).toString("base64url");
    const offset = Buffer.from(JSON.stringify({ o: 50, v: 2 })).toString("base64url");

    expectInvalidCursor(() => decodeCursor(keyset, "kw"));
    expectInvalidCursor(() => decodeOffsetCursor(offset));
  });

  it("round-trips an unprefixed item ID without relaxing public cursors", () => {
    const cursor = encodeUnprefixedCursor({
      publicId: "run_item_db_1",
      timestamp: new Date("2026-09-02T12:00:00.000Z"),
    });

    expect(decodeUnprefixedCursor(cursor)).toEqual({
      public_id: "run_item_db_1",
      t: "2026-09-02T12:00:00.000Z",
      v: 3,
    });
    expectInvalidCursor(() => decodeCursor(cursor, "rcr"));
  });
});

describe("list page query", () => {
  const url = (query: string) => new URL(`https://example.com/api/v1/projects${query}`);

  it("treats empty values as absent and applies the fallback limit", () => {
    expect(parsePageQuery(url("?limit=&cursor="))).toEqual({ cursor: null, limit: 50 });
    expect(parsePageQuery(url("?limit=20&cursor=abc"), 50, 100)).toEqual({
      cursor: "abc",
      limit: 20,
    });
  });

  it("enforces the limit bounds of the shared Limit parameter", () => {
    expect(() => parsePageQuery(url("?limit=0"))).toThrow(ZodError);
    expect(() => parsePageQuery(url("?limit=201"))).toThrow(ZodError);
    expect(() => parsePageQuery(url("?limit=101"), 50, 100)).toThrow(ZodError);
    expect(() => parsePageQuery(url("?limit=1.5"))).toThrow(ZodError);
  });
});
