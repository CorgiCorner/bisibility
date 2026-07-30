import "server-only";

import {
  importSessionChunkSchema,
  importSessionIdSchema,
  receiveImportSessionChunk,
} from "@/lib/api/cloud-import";
import {
  anonymousRateLimit,
  authorizeMigrationRequest,
  bodyTooLarge,
  instance,
  mapImportSessionError,
  maxBodyBytes,
  payloadTooLarge,
  readJsonBody,
  requireMigrationToken,
  validationError,
} from "@/lib/api/instance-import/session-http";
import { errorResponse, resourceResponse } from "@/lib/api/responses";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ index: string; sessionId: string }>;
};

function parseIndex(value: string) {
  return /^\d+$/.test(value) ? Number.parseInt(value, 10) : null;
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const limit = maxBodyBytes();
  if (bodyTooLarge(req, limit)) return payloadTooLarge(req);

  const anonymous = await anonymousRateLimit(req);
  if ("response" in anonymous) return anonymous.response;

  try {
    const params = await context.params;
    const sessionId = importSessionIdSchema.safeParse(params.sessionId);
    if (!sessionId.success) return validationError(req, sessionId.error, anonymous.headers);
    const index = parseIndex(params.index);
    if (index === null) {
      return errorResponse("bad_request", "Chunk index is out of range.", 400, {
        headers: anonymous.headers,
        instance: instance(req),
      });
    }

    const gzip = req.headers.get("content-encoding")?.toLowerCase() === "gzip";
    const { bytes, rawBody } = await readJsonBody(req, { gzip, limit });
    const tokenMissing = requireMigrationToken(req, anonymous.headers);
    if (tokenMissing) return tokenMissing;

    const body = importSessionChunkSchema.safeParse(rawBody);
    if (!body.success) return validationError(req, body.error, anonymous.headers);

    const auth = await authorizeMigrationRequest(req, anonymous.headers);
    if ("response" in auth) return auth.response;

    const result = await receiveImportSessionChunk(
      auth.token,
      sessionId.data,
      index,
      body.data,
      bytes,
    );
    return resourceResponse(
      {
        chunk_count: result.chunkCount,
        chunks_received: result.chunksReceived,
        state: result.state,
      },
      { headers: auth.headers },
    );
  } catch (error) {
    return mapImportSessionError(req, error, anonymous.headers);
  }
}
