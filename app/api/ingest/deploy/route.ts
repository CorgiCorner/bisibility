import "server-only";

import { checkRateLimit, rateLimitExceeded } from "@/lib/api/ratelimit";
import { errorResponse, jsonResponse } from "@/lib/api/responses";
import { isProjectReadOnly, ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { ingestDeployEvent } from "@/lib/ingest/ingest-deploy-event";
import { hashApiKey } from "@/lib/providers/crypto";
import { findDeployIngestHook } from "@/lib/queries/ingest-deploy";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 256 * 1024;

function instance(req: Request) {
  return `urn:bisibility:api:ingest-deploy:${new URL(req.url).pathname}`;
}

function bearerToken(req: Request) {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token, extra] = header.trim().split(/\s+/);
  return scheme?.toLowerCase() === "bearer" && token && !extra ? token : null;
}

function authToken(req: Request, url: URL) {
  // Deprecated: prefer Authorization; query tokens leak into proxy/access logs.
  return bearerToken(req) ?? url.searchParams.get("token");
}

async function readJsonBody(req: Request, headers: Headers) {
  const tooLarge = () =>
    errorResponse("bad_request", "Request body is too large.", 413, {
      headers,
      instance: instance(req),
    });
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { response: tooLarge() };
  }

  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return { response: tooLarge() };
  }

  try {
    return { body: JSON.parse(text) as unknown };
  } catch {
    return {
      response: errorResponse("bad_request", "Request body must be valid JSON.", 400, {
        headers,
        instance: instance(req),
      }),
    };
  }
}

async function findHook(rawToken: string | null) {
  if (!rawToken) return null;
  return findDeployIngestHook(hashApiKey(rawToken));
}

function unauthorized(req: Request, headers: Headers) {
  return errorResponse("unauthorized", "A valid ingest hook token is required.", 401, {
    headers,
    instance: instance(req),
  });
}

function readOnly(headers: Headers, req: Request) {
  const error = new ProjectReadOnlyError();
  return errorResponse("project_read_only", error.message, 423, {
    headers,
    instance: instance(req),
  });
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const anonymousLimit = await checkRateLimit(req, { kind: "anonymous" });
  if (!anonymousLimit.success) {
    return rateLimitExceeded(anonymousLimit);
  }

  const hook = await findHook(authToken(req, url));
  if (!hook || hook.disabled) {
    return unauthorized(req, anonymousLimit.headers);
  }
  if (isProjectReadOnly(hook.project.writeMode)) {
    return readOnly(anonymousLimit.headers, req);
  }

  const hookLimit = await checkRateLimit(req, {
    id: `ingest-hook:${hook.id}`,
    kind: "api-key",
  });
  if (!hookLimit.success) {
    return rateLimitExceeded(hookLimit);
  }

  const raw = await readJsonBody(req, hookLimit.headers);
  if ("response" in raw) return raw.response;

  const provider = url.searchParams.get("provider");
  const result = await ingestDeployEvent({
    actorId: null,
    body: raw.body,
    hookId: hook.id,
    projectId: hook.projectId,
    provider,
  });
  if (result.status === "unparseable") {
    return errorResponse("validation_failed", "Deploy event could not be parsed.", 422, {
      headers: hookLimit.headers,
      instance: instance(req),
    });
  }
  if (result.status === "duplicate") {
    return jsonResponse({ duplicate: true, ok: true }, { headers: hookLimit.headers, status: 202 });
  }

  return jsonResponse({ ok: true }, { headers: hookLimit.headers, status: 202 });
}
