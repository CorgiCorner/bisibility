import "server-only";

import {
  bearerMigrationToken,
  CloudImportTokenError,
  cloudImportPackageSchema,
  importCloudExport,
  jobView,
  parseMigrationToken,
  SelfImportError,
} from "@/lib/api/cloud-import";
import { verifyMigrationTokenInternal } from "@/lib/api/instance-import/token-verifier";
import { checkRateLimit, rateLimitExceeded } from "@/lib/api/ratelimit";
import { errorResponse, resourceResponse } from "@/lib/api/responses";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import {
  IMPORT_PACKAGE_MAX_BODY_BYTES,
  IMPORT_PACKAGE_MAX_KEYWORDS,
  keywordLimitDetail,
  payloadLimitDetail,
} from "@/lib/migration/package-limits";
import type { NextRequest } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIGRATION_HOLD_DETAIL =
  "Destination project is in migration hold - release it before importing.";

function instance(req: Request) {
  return `urn:bisibility:api:cloud-import:${new URL(req.url).pathname}`;
}

function authError(status: 401 | 419, req: Request, detail: string, headers?: Headers) {
  return errorResponse("unauthorized", detail, status, { headers, instance: instance(req) });
}

function inputKeywordCount(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const keywords = (input as Record<string, unknown>).keywords;
  return Array.isArray(keywords) ? keywords.length : null;
}

function validationError(req: Request, error: z.ZodError, input: unknown, headers?: Headers) {
  const keywordCount = inputKeywordCount(input);
  const keywordLimitIssue = error.issues.some(
    (issue) => issue.code === "too_big" && issue.path.length === 1 && issue.path[0] === "keywords",
  );
  const detail =
    keywordCount !== null && (keywordCount > IMPORT_PACKAGE_MAX_KEYWORDS || keywordLimitIssue)
      ? keywordLimitDetail(keywordCount)
      : "Request input failed validation.";
  return errorResponse("validation_failed", detail, 400, {
    details: z.flattenError(error),
    headers,
    instance: instance(req),
  });
}

function tokenExpired(error: unknown) {
  return error instanceof CloudImportTokenError;
}

function maxBodyBytes() {
  const parsed = Number.parseInt(process.env.BISIBILITY_MIGRATION_IMPORT_MAX_BODY_BYTES ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : IMPORT_PACKAGE_MAX_BODY_BYTES;
}

function bodyTooLarge(req: Request, limit: number) {
  const length = Number.parseInt(req.headers.get("content-length") ?? "", 10);
  return Number.isFinite(length) && length > limit;
}

function payloadTooLarge(req: Request, limit: number, headers?: Headers) {
  return errorResponse("bad_request", payloadLimitDetail(limit), 413, {
    headers,
    instance: instance(req),
  });
}

export async function POST(req: NextRequest) {
  const limit = maxBodyBytes();
  if (bodyTooLarge(req, limit)) {
    return payloadTooLarge(req, limit);
  }

  const anonymousLimit = await checkRateLimit(req, { kind: "anonymous" });
  if (!anonymousLimit.success) {
    return rateLimitExceeded(anonymousLimit);
  }

  let rawBody: unknown;
  try {
    const text = await req.text();
    if (Buffer.byteLength(text, "utf8") > limit) {
      return payloadTooLarge(req, limit, anonymousLimit.headers);
    }
    rawBody = JSON.parse(text) as unknown;
  } catch {
    return errorResponse("bad_request", "Request body must be valid JSON.", 400, {
      headers: anonymousLimit.headers,
      instance: instance(req),
    });
  }

  const token = parseMigrationToken(bearerMigrationToken(req.headers.get("authorization")));
  if (!token.success) {
    return authError(401, req, "A valid migration token is required.", anonymousLimit.headers);
  }

  const body = cloudImportPackageSchema.safeParse(rawBody);
  if (!body.success) {
    return validationError(req, body.error, rawBody, anonymousLimit.headers);
  }

  try {
    const verified = await verifyMigrationTokenInternal(token.data);
    const tokenLimit = await checkRateLimit(req, {
      id: `cloud-import:${verified.projectId}:${verified.id}`,
      kind: "api-key",
    });
    if (!tokenLimit.success) {
      return rateLimitExceeded(tokenLimit);
    }
    const result = await importCloudExport(verified, body.data, new URL(req.url));

    return resourceResponse(
      { counts: result.counts, job_id: jobView(result.job).id, state: result.job.state },
      { headers: tokenLimit.headers, instance: instance(req), status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationError(req, error, rawBody, anonymousLimit.headers);
    }
    if (error instanceof ProjectReadOnlyError) {
      return errorResponse("project_read_only", MIGRATION_HOLD_DETAIL, 423, {
        headers: anonymousLimit.headers,
        instance: instance(req),
      });
    }
    if (error instanceof SelfImportError) {
      return errorResponse("self_import", error.message, 409, {
        headers: anonymousLimit.headers,
        instance: instance(req),
      });
    }
    if (tokenExpired(error)) {
      return authError(419, req, "Migration token is invalid or expired.", anonymousLimit.headers);
    }

    return errorResponse("internal_server_error", "Instance import failed.", 500, {
      headers: anonymousLimit.headers,
      instance: instance(req),
    });
  }
}
