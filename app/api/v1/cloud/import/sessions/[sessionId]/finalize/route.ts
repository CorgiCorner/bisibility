import "server-only";

import { finalizeImportSession, importSessionIdSchema, jobView } from "@/lib/api/cloud-import";
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
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

const finalizeBodySchema = z.object({}).strict();

export async function POST(req: NextRequest, context: RouteContext) {
  const limit = maxBodyBytes();
  if (bodyTooLarge(req, limit)) return payloadTooLarge(req);

  const anonymous = await anonymousRateLimit(req);
  if ("response" in anonymous) return anonymous.response;

  try {
    const { sessionId: rawSessionId } = await context.params;
    const sessionId = importSessionIdSchema.safeParse(rawSessionId);
    if (!sessionId.success) return validationError(req, sessionId.error, anonymous.headers);

    const { rawBody } = await readJsonBody(req, { allowEmpty: true, limit });
    const tokenMissing = requireMigrationToken(req, anonymous.headers);
    if (tokenMissing) return tokenMissing;
    const body = finalizeBodySchema.safeParse(rawBody);
    if (!body.success) return validationError(req, body.error, anonymous.headers);

    const auth = await authorizeMigrationRequest(req, anonymous.headers);
    if ("response" in auth) return auth.response;

    const result = await finalizeImportSession(auth.token, sessionId.data, new URL(req.url));
    return resourceResponse(
      {
        counts: result.counts,
        job_id: jobView(result.job).id,
        state: "done",
      },
      { headers: auth.headers },
    );
  } catch (error) {
    return mapImportSessionError(req, error, anonymous.headers);
  }
}
