import "server-only";
import { getPurposeSecretKeys } from "@/lib/providers/crypto";
import { createReportCursorCodec, type ReportCursorCodec } from "@/lib/rank-reports/cursor";
import { RankReportCursorError } from "@/lib/rank-reports/errors";
/** Existing host keyring, isolated purpose; no credential or signing key is supplied by a request. */
export function localResultCursorCodec(): ReportCursorCodec {
  const codecs = getPurposeSecretKeys("bisibility:local-monitor:result-history:v1").map(
      createReportCursorCodec,
    ),
    first = codecs[0];
  if (!first) throw new Error("Local history cursor keyring is unavailable");
  return {
    encode: (payload) => first.encode(payload),
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
