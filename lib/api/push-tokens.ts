import "server-only";

import type { DevicePushToken } from "@/lib/generated/prisma/client";
import {
  deletePushToken,
  listPushTokens,
  registerPushToken,
} from "@/lib/notifications/push-tokens";
import { z } from "zod";
import { notFound, type PersonalApiContext } from "./context";
import { listResponse, resourceResponse } from "./responses";
import { objectBody, parseApiInput, readJsonBody } from "./surface";

export const pushTokenRegisterSchema = z
  .object({
    bundleId: z
      .string()
      .trim()
      .min(1)
      .max(155)
      .regex(/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/),
    environment: z.enum(["production", "sandbox"]),
    token: z
      .string()
      .trim()
      .regex(/^[0-9A-Fa-f]{32,200}$/),
  })
  .strict();

/** The token itself is never echoed; the suffix lets a user tell devices apart. */
export function pushTokenResource(row: DevicePushToken) {
  return {
    bundle_id: row.bundleId,
    created_at: row.createdAt.toISOString(),
    environment: row.environment,
    id: row.publicId,
    last_seen_at: row.lastSeenAt.toISOString(),
    token_suffix: row.token.slice(-8),
  };
}

export async function listDevicePushTokens(ctx: PersonalApiContext) {
  const rows = await listPushTokens(ctx.auth.user.id);
  return listResponse(rows.map(pushTokenResource), null, { headers: ctx.headers });
}

export async function registerDevicePushToken(ctx: PersonalApiContext) {
  const data = parseApiInput(pushTokenRegisterSchema, objectBody(await readJsonBody(ctx)));
  const row = await registerPushToken(ctx.auth.user.id, data);
  return resourceResponse(pushTokenResource(row), { headers: ctx.headers });
}

export async function deleteDevicePushToken(ctx: PersonalApiContext, tokenId: string) {
  const row = await deletePushToken(ctx.auth.user.id, tokenId);
  if (!row) return notFound(ctx, "Device push token not found.");
  return resourceResponse(pushTokenResource(row), { headers: ctx.headers });
}
