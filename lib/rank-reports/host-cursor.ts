import "server-only";
import { getPurposeSecretKeys } from "@/lib/providers/crypto";
import { createReportCursorCodec, type ReportCursorCodec } from "./cursor";
import { RankReportCursorError } from "./errors";

/** Uses the existing host keyring with a separate HMAC purpose; no new credential or client key. */
export function hostRankReportCursorCodec(): ReportCursorCodec {
  const codecs = getPurposeSecretKeys("bisibility:rank-report:host-cursor:v1").map(
    createReportCursorCodec,
  );
  const primary = codecs[0];
  if (!primary) throw new Error("The host cursor signing keyring is unavailable.");
  return {
    encode: (payload) => primary.encode(payload),
    decode(token) {
      for (const codec of codecs) {
        try {
          return codec.decode(token);
        } catch (error) {
          if (!(error instanceof RankReportCursorError)) throw error;
        }
      }
      throw new RankReportCursorError();
    },
  };
}
