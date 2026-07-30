import "server-only";

import { randomBytes } from "node:crypto";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { hashApiKey } from "@/lib/providers/crypto";
import { resolveApiKeyExpiry } from "./api-key-policy";
import { apiKeyAuditResource } from "./audit-resources";
import { type ApiContext, notFound } from "./context";
import { scopesForTier } from "./key-scope";
import { decodeCursor, encodeCursor, parseLimit, splitPage } from "./pagination";
import { requireApiPublicId } from "./public-id";
import { apiKeyResource } from "./resources";
import { listResponse, resourceResponse } from "./responses";
import { apiKeyCreateSchema } from "./schemas";
import { objectBody, parseApiInput, readJsonBody, scopedProject } from "./surface";

function newRawApiKey() {
  return `bsb_key_live_${randomBytes(24).toString("base64url")}`;
}

function maskKey(raw: string) {
  return `${raw.slice(0, 21)}******${raw.slice(-4)}`;
}

export async function listApiKeys(ctx: ApiContext) {
  const limit = parseLimit(ctx.url, 50, 200);
  const cursor = decodeCursor(ctx.url.searchParams.get("cursor"), "key");

  const keys = await prisma.apiKey.findMany({
    orderBy: [{ createdAt: "desc" }, { publicId: "desc" }],
    take: limit + 1,
    where: {
      projectId: ctx.auth.project.id,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: new Date(cursor.t) } },
              { createdAt: new Date(cursor.t), publicId: { lt: cursor.public_id } },
            ],
          }
        : {}),
    },
  });
  const { nextCursor, page } = splitPage(keys, limit, (key) =>
    encodeCursor(
      {
        publicId: requireApiPublicId(key.publicId, "key"),
        timestamp: key.createdAt,
      },
      "key",
    ),
  );

  return listResponse(page.map(apiKeyResource), nextCursor, { headers: ctx.headers });
}

export async function createApiKey(ctx: ApiContext) {
  const body = await readJsonBody(ctx);
  const data = parseApiInput(apiKeyCreateSchema, objectBody(body));
  const raw = newRawApiKey();
  const expiresAt = resolveApiKeyExpiry(data.expiresInDays);
  const publicId = makePublicId("key");
  const apiKey = await prisma.apiKey.create({
    data: {
      expiresAt,
      hashedKey: hashApiKey(raw),
      name: data.name,
      prefix: raw.slice(0, 21),
      publicId,
      projectId: ctx.auth.project.id,
      scopes: scopesForTier(data.scope),
    },
  });

  await writeAudit({
    action: "api_key.issue",
    actorId: ctx.actorId ?? null,
    after: apiKeyAuditResource(apiKey),
    projectId: ctx.auth.project.id,
    targetId: requireApiPublicId(apiKey.publicId, "key"),
    targetType: "api_key",
  });

  return resourceResponse(
    { ...apiKeyResource(apiKey), masked_value: maskKey(raw), token: raw },
    { headers: ctx.headers, status: 201 },
  );
}

// Nested /projects/{id}/api-keys aliases used by personal tokens (and valid
// for project keys targeting their own project).
export function listProjectApiKeys(ctx: ApiContext, projectId: string) {
  return scopedProject(ctx, projectId) ?? listApiKeys(ctx);
}

export function createProjectApiKey(ctx: ApiContext, projectId: string) {
  return scopedProject(ctx, projectId) ?? createApiKey(ctx);
}

export async function revokeApiKey(ctx: ApiContext, keyId: string) {
  const apiKey = await prisma.apiKey.findFirst({
    where: { publicId: keyId, projectId: ctx.auth.project.id },
  });
  if (!apiKey) {
    return notFound(ctx, "API key not found.");
  }

  const revoked = await prisma.apiKey.update({
    data: { revokedAt: new Date() },
    where: { id: apiKey.id },
  });

  await writeAudit({
    action: "api_key.revoke",
    actorId: ctx.actorId ?? null,
    after: apiKeyAuditResource(revoked),
    before: apiKeyAuditResource(apiKey),
    projectId: ctx.auth.project.id,
    targetId: requireApiPublicId(revoked.publicId, "key"),
    targetType: "api_key",
  });

  return resourceResponse(apiKeyResource(revoked), { headers: ctx.headers });
}
