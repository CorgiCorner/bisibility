import "server-only";

import { gunzipSync } from "node:zlib";
import { checkRateLimit, rateLimitExceeded } from "@/lib/api/ratelimit";
import { type ApiErrorCode, errorResponse } from "@/lib/api/responses";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { z } from "zod";
import type { VerifiedMigrationToken } from "./jobs";
import { CloudImportTokenError, SelfImportError } from "./jobs";
import { bearerMigrationToken, parseMigrationToken } from "./normalize";
import { BODY_TOO_LARGE_DETAIL, ImportSessionProtocolError } from "./session";
import { verifyMigrationTokenInternal } from "./token-verifier";

const DEFAULT_MAX_BODY_BYTES = 8_388_608;
const MIGRATION_HOLD_DETAIL =
  "Destination workspace is in migration hold - release it before importing.";

type BodyOptions = {
  allowEmpty?: boolean;
  gzip?: boolean;
  limit: number;
};

type RateLimitResult =
  | { headers: Headers; response?: never }
  | { headers?: never; response: Response };

type AuthResult =
  | { headers: Headers; response?: never; token: VerifiedMigrationToken }
  | { headers?: never; response: Response; token?: never };

export class ImportSessionBodyError extends Error {
  constructor(
    public readonly status: 400 | 413,
    public readonly detail: string,
  ) {
    super(detail);
  }
}

export function instance(req: Request) {
  return `urn:bisibility:api:cloud-import:${new URL(req.url).pathname}`;
}

export function maxBodyBytes() {
  const parsed = Number.parseInt(process.env.BISIBILITY_MIGRATION_IMPORT_MAX_BODY_BYTES ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_BODY_BYTES;
}

export function bodyTooLarge(req: Request, limit: number) {
  const length = Number.parseInt(req.headers.get("content-length") ?? "", 10);
  return Number.isFinite(length) && length > limit;
}

export function payloadTooLarge(req: Request, headers?: Headers, detail = BODY_TOO_LARGE_DETAIL) {
  return errorResponse("bad_request", detail, 413, { headers, instance: instance(req) });
}

function authError(status: 401 | 419, req: Request, detail: string, headers?: Headers) {
  return errorResponse("unauthorized", detail, status, { headers, instance: instance(req) });
}

export function validationError(req: Request, error: z.ZodError, headers?: Headers) {
  return errorResponse("validation_failed", "Request input failed validation.", 400, {
    details: z.flattenError(error),
    headers,
    instance: instance(req),
  });
}

export function tokenExpired(error: unknown) {
  return error instanceof CloudImportTokenError;
}

export function requireMigrationToken(req: Request, headers?: Headers) {
  const token = parseMigrationToken(bearerMigrationToken(req.headers.get("authorization")));
  return token.success
    ? null
    : authError(401, req, "A valid migration token is required.", headers);
}

export async function anonymousRateLimit(req: Request): Promise<RateLimitResult> {
  const limit = await checkRateLimit(req, { kind: "anonymous" });
  return limit.success ? { headers: limit.headers } : { response: rateLimitExceeded(limit) };
}

export async function authorizeMigrationRequest(
  req: Request,
  headers?: Headers,
): Promise<AuthResult> {
  const token = parseMigrationToken(bearerMigrationToken(req.headers.get("authorization")));
  if (!token.success) {
    return { response: authError(401, req, "A valid migration token is required.", headers) };
  }

  try {
    const verified = await verifyMigrationTokenInternal(token.data);
    const tokenLimit = await checkRateLimit(req, {
      id: `cloud-import:${verified.projectId}:${verified.id}`,
      kind: "api-key",
    });
    if (!tokenLimit.success) return { response: rateLimitExceeded(tokenLimit) };
    return { headers: tokenLimit.headers, token: verified };
  } catch (error) {
    if (error instanceof ProjectReadOnlyError) {
      return {
        response: errorResponse("project_read_only", MIGRATION_HOLD_DETAIL, 423, {
          headers,
          instance: instance(req),
        }),
      };
    }
    if (tokenExpired(error)) {
      return {
        response: authError(419, req, "Migration token is invalid or expired.", headers),
      };
    }
    throw error;
  }
}

export async function readJsonBody(req: Request, options: BodyOptions) {
  const raw = Buffer.from(await req.arrayBuffer());
  if (raw.byteLength > options.limit) {
    throw new ImportSessionBodyError(413, BODY_TOO_LARGE_DETAIL);
  }
  if (raw.byteLength === 0 && options.allowEmpty) {
    return { bytes: 0, rawBody: {} as unknown };
  }

  let decoded = raw;
  if (options.gzip) {
    try {
      // maxOutputLength caps the decompressed allocation, so a small highly
      // compressible body cannot balloon past the configured limit.
      decoded = gunzipSync(raw, { maxOutputLength: options.limit });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      if (code === "ERR_BUFFER_TOO_LARGE" || error instanceof RangeError) {
        throw new ImportSessionBodyError(413, BODY_TOO_LARGE_DETAIL);
      }
      throw new ImportSessionBodyError(400, "Request body could not be decoded as gzip.");
    }
  }
  if (decoded.byteLength > options.limit) {
    throw new ImportSessionBodyError(413, BODY_TOO_LARGE_DETAIL);
  }

  try {
    const text = decoded.toString("utf8");
    return { bytes: Buffer.byteLength(text, "utf8"), rawBody: JSON.parse(text) as unknown };
  } catch {
    throw new ImportSessionBodyError(400, "Request body must be valid JSON.");
  }
}

export function mapImportSessionError(req: Request, error: unknown, headers?: Headers) {
  if (error instanceof z.ZodError) return validationError(req, error, headers);
  if (error instanceof ImportSessionBodyError) {
    return error.status === 413
      ? payloadTooLarge(req, headers, error.detail)
      : errorResponse("bad_request", error.detail, 400, { headers, instance: instance(req) });
  }
  if (error instanceof ProjectReadOnlyError) {
    return errorResponse("project_read_only", MIGRATION_HOLD_DETAIL, 423, {
      headers,
      instance: instance(req),
    });
  }
  if (error instanceof SelfImportError) {
    return errorResponse("self_import", error.message, 409, { headers, instance: instance(req) });
  }
  if (tokenExpired(error)) {
    return authError(419, req, "Migration token is invalid or expired.", headers);
  }
  if (error instanceof ImportSessionProtocolError) {
    let code: ApiErrorCode = "bad_request";
    if (error.status === 404) code = "not_found";
    else if (error.status === 409) code = "conflict";
    return errorResponse(code, error.detail, error.status, { headers, instance: instance(req) });
  }
  return errorResponse("internal_server_error", "Cloud import failed.", 500, {
    headers,
    instance: instance(req),
  });
}
