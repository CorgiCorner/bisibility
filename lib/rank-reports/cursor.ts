import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { RankReportCursorError } from "./errors";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const payloadSchema = z
  .object({
    asOf: z.iso.datetime(),
    binding: hash,
    last: z.object({ at: z.iso.datetime(), id: z.string().min(1).max(512) }).strict(),
    source: hash,
    version: z.literal(1),
  })
  .strict();
export type ReportCursorPayload = z.infer<typeof payloadSchema>;
export type ReportCursorCodec = {
  decode: (token: string) => ReportCursorPayload;
  encode: (payload: ReportCursorPayload) => string;
};

/** Key lifecycle belongs to the trusted host adapter; no ambient credential or secret lookup. */
export function createReportCursorCodec(key: string | Uint8Array): ReportCursorCodec {
  if (Buffer.byteLength(key) < 32)
    throw new Error("Report cursors require a signing key of at least 32 bytes.");
  const pinnedKey = typeof key === "string" ? key : Buffer.from(key);
  const sign = (body: string) =>
    createHmac("sha256", pinnedKey)
      .update("bisibility:rank-report:cursor:v1:")
      .update(body)
      .digest();
  return {
    encode(payload) {
      const body = Buffer.from(JSON.stringify(payloadSchema.parse(payload))).toString("base64url");
      return `${body}.${sign(body).toString("base64url")}`;
    },
    decode(token) {
      try {
        if (token.length > 8192) throw new RankReportCursorError();
        const [body, signature, extra] = token.split(".");
        if (!body || !signature || extra !== undefined) throw new RankReportCursorError();
        const actual = Buffer.from(signature, "base64url");
        const expected = sign(body);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
          throw new RankReportCursorError();
        return payloadSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
      } catch {
        throw new RankReportCursorError();
      }
    },
  };
}
