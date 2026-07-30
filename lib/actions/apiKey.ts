"use server";

import { randomBytes } from "node:crypto";
import { inheritedApiKeyExpiry, resolveApiKeyExpiry } from "@/lib/api/api-key-policy";
import { scopesForTier, tierFromScopes } from "@/lib/api/key-scope";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { makePublicId, parsePublicId } from "@/lib/db/public-id";
import { hashApiKey } from "@/lib/providers/crypto";
import {
  type ApiKeyScope,
  issueApiKeySchema,
  regenerateApiKeySchema,
  revokeApiKeySchema,
} from "@/lib/schemas/apiKey";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateSettingsViews,
} from "./_shared";

function newRawApiKey() {
  return `bsb_key_live_${randomBytes(24).toString("base64url")}`;
}

function maskIssuedKey(raw: string) {
  return `${raw.slice(0, 21)}******${raw.slice(-4)}`;
}

function apiKeyCreateData(
  raw: string,
  name: string,
  projectId: string,
  scope: ApiKeyScope,
  expiresAt: Date | null,
) {
  return {
    expiresAt,
    hashedKey: hashApiKey(raw),
    name,
    prefix: raw.slice(0, 21),
    publicId: makePublicId("key"),
    projectId,
    scopes: scopesForTier(scope),
  };
}

export async function issueApiKey(input: unknown) {
  const data = parseActionInput(issueApiKeySchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, { type: "api_key" });
  const raw = newRawApiKey();
  const expiresAt = resolveApiKeyExpiry(data.expiresInDays);
  const apiKey = await prisma.apiKey.create({
    data: apiKeyCreateData(raw, data.name, project.id, data.scope, expiresAt),
    select: {
      createdAt: true,
      expiresAt: true,
      id: true,
      name: true,
      prefix: true,
      publicId: true,
    },
  });

  await writeAudit({
    action: "api_key.issue",
    actorId: actor.id,
    after: {
      expiresAt: apiKey.expiresAt,
      id: apiKey.publicId,
      name: apiKey.name,
      prefix: apiKey.prefix,
      scope: data.scope,
    },
    projectId: project.id,
    targetId: requiredPublicId(apiKey.publicId),
    targetType: "api_key",
  });
  revalidateSettingsViews();

  return {
    createdAt: apiKey.createdAt,
    expiresAt: apiKey.expiresAt,
    expiresInDays: data.expiresInDays,
    id: requiredPublicId(apiKey.publicId),
    maskedValue: maskIssuedKey(raw),
    name: apiKey.name,
    prefix: apiKey.prefix,
    raw,
    scope: data.scope,
  };
}

export async function revokeApiKey(input: unknown) {
  const data = parseActionInput(revokeApiKeySchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, { type: "api_key" });
  if (parsePublicId(data.apiKeyId)?.prefix !== "key") throw new Error("API key not found.");
  const before = await prisma.apiKey.findFirst({
    where: { projectId: project.id, publicId: data.apiKeyId },
  });
  if (!before) {
    throw new Error("API key not found.");
  }

  const apiKey = await prisma.apiKey.update({
    data: { revokedAt: new Date() },
    where: { id: before.id },
  });

  await writeAudit({
    action: "api_key.revoke",
    actorId: actor.id,
    after: { id: apiKey.publicId, revokedAt: apiKey.revokedAt },
    before: { id: before.publicId, revokedAt: before.revokedAt },
    projectId: project.id,
    targetId: requiredPublicId(apiKey.publicId),
    targetType: "api_key",
  });
  revalidateSettingsViews();

  return { id: requiredPublicId(apiKey.publicId), revokedAt: apiKey.revokedAt };
}

export async function regenerateApiKey(input: unknown) {
  const data = parseActionInput(regenerateApiKeySchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, { type: "api_key" });
  if (parsePublicId(data.apiKeyId)?.prefix !== "key") throw new Error("API key not found.");
  const before = await prisma.apiKey.findFirst({
    where: { projectId: project.id, publicId: data.apiKeyId, revokedAt: null },
  });
  if (!before) {
    throw new Error("API key not found.");
  }

  const raw = newRawApiKey();
  const now = new Date();
  const scope = tierFromScopes(before.scopes);
  const policy = inheritedApiKeyExpiry(before.createdAt, before.expiresAt, now);
  const [revoked, apiKey] = await prisma.$transaction([
    prisma.apiKey.update({
      data: { revokedAt: now },
      where: { id: before.id },
    }),
    prisma.apiKey.create({
      data: apiKeyCreateData(raw, before.name, project.id, scope, policy.expiresAt),
      select: {
        createdAt: true,
        expiresAt: true,
        id: true,
        name: true,
        prefix: true,
        publicId: true,
      },
    }),
  ]);

  await writeAudit({
    action: "api_key.regenerate",
    actorId: actor.id,
    after: {
      expiresAt: apiKey.expiresAt,
      id: apiKey.publicId,
      name: apiKey.name,
      prefix: apiKey.prefix,
      revokedId: revoked.publicId,
    },
    before: { id: before.publicId, name: before.name, revokedAt: before.revokedAt },
    projectId: project.id,
    targetId: requiredPublicId(apiKey.publicId),
    targetType: "api_key",
  });
  revalidateSettingsViews();

  return {
    createdAt: apiKey.createdAt,
    expiresAt: apiKey.expiresAt,
    expiresInDays: policy.expiresInDays,
    id: requiredPublicId(apiKey.publicId),
    maskedValue: maskIssuedKey(raw),
    name: apiKey.name,
    prefix: apiKey.prefix,
    raw,
    revokedId: requiredPublicId(revoked.publicId),
    scope,
  };
}

function requiredPublicId(value: string | null) {
  if (!value || parsePublicId(value)?.prefix !== "key") {
    throw new Error("API key public ID is not available.");
  }
  return value;
}
