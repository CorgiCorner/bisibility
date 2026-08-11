import "server-only";

import {
  createImportSession,
  importSessionCreateSchema,
  MAX_CHUNK_HISTORY_ROWS,
  MAX_CHUNK_KEYWORDS,
} from "@/lib/api/cloud-import";
import { jobView } from "@/lib/api/instance-import/jobs";
import {
  anonymousRateLimit,
  authorizeMigrationRequest,
  bodyTooLarge,
  mapImportSessionError,
  maxBodyBytes,
  payloadTooLarge,
  readJsonBody,
  requireMigrationToken,
  validationError,
} from "@/lib/api/instance-import/session-http";
import { resourceResponse } from "@/lib/api/responses";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limit = maxBodyBytes();
  if (bodyTooLarge(req, limit)) return payloadTooLarge(req);

  const anonymous = await anonymousRateLimit(req);
  if ("response" in anonymous) return anonymous.response;

  try {
    const { rawBody } = await readJsonBody(req, { limit });
    const tokenMissing = requireMigrationToken(req, anonymous.headers);
    if (tokenMissing) return tokenMissing;

    const body = importSessionCreateSchema.safeParse(rawBody);
    if (!body.success) return validationError(req, body.error, anonymous.headers);

    const auth = await authorizeMigrationRequest(req, anonymous.headers);
    if ("response" in auth) return auth.response;

    const session = await createImportSession(auth.token, body.data);
    return resourceResponse(
      {
        chunk_limits: {
          max_body_bytes: limit,
          max_history_rows: MAX_CHUNK_HISTORY_ROWS,
          max_keywords: MAX_CHUNK_KEYWORDS,
        },
        session_id: jobView(session).id,
        state: "receiving",
      },
      { headers: auth.headers, status: 201 },
    );
  } catch (error) {
    return mapImportSessionError(req, error, anonymous.headers);
  }
}
