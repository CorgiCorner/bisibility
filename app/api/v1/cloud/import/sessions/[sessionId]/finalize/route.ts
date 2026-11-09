import "server-only";

import {
  finalizeImportSession,
  importSessionFinalizeSchema,
  importSessionIdSchema,
  jobView,
} from "@/lib/api/cloud-import";
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

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  const limit = maxBodyBytes();
  if (bodyTooLarge(req, limit)) return payloadTooLarge(req);

  const anonymous = await anonymousRateLimit(req);
  if ("response" in anonymous) return anonymous.response;

  let committed = false;
  try {
    const { sessionId: rawSessionId } = await context.params;
    const sessionId = importSessionIdSchema.safeParse(rawSessionId);
    if (!sessionId.success) return validationError(req, sessionId.error, anonymous.headers);

    const { rawBody } = await readJsonBody(req, { allowEmpty: true, limit });
    const tokenMissing = requireMigrationToken(req, anonymous.headers);
    if (tokenMissing) return tokenMissing;
    const body = importSessionFinalizeSchema.safeParse(rawBody);
    if (!body.success) return validationError(req, body.error, anonymous.headers);

    const auth = await authorizeMigrationRequest(req, anonymous.headers);
    if ("response" in auth) return auth.response;

    const result = await finalizeImportSession(auth.token, sessionId.data, new URL(req.url), () => {
      committed = true;
    });
    const response = resourceResponse(
      {
        counts: result.counts,
        job_id: jobView(result.job).id,
        state: "done",
      },
      { headers: auth.headers },
    );
    response.headers.set("X-Mutation-Committed", String(committed));
    return response;
  } catch (error) {
    const response = mapImportSessionError(req, error, anonymous.headers);
    response.headers.set("X-Mutation-Committed", String(committed));
    return response;
  }
}
