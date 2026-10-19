import "server-only";

import {
  AccountDeletionConfirmationError,
  deleteAccountRecords,
  LastInstanceAdminDeletionError,
} from "@/lib/account/account-deletion";
import { updateProfileNameRecord } from "@/lib/account/profile-service";
import { prisma } from "@/lib/db/prisma";
import { ownProviderKeysRequired } from "@/lib/providers/own-key-policy-extension";
import { missingOwnKeys } from "@/lib/providers/own-key-readiness";
import type { PersonalApiContext } from "./context";
import { requireApiPublicId } from "./public-id";
import { errorResponse, resourceResponse } from "./responses";
import { meDeleteSchema, mePatchSchema } from "./schemas";
import { objectBody, parseApiInput, readJsonBody } from "./surface";

async function meResource(
  userId: string,
  user: { email: string; name: string; publicId: string | null },
) {
  const memberships = await prisma.membership.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      project: {
        select: {
          domain: true,
          name: true,
          ownerId: true,
          providerConnections: {
            select: {
              credentialSource: true,
              credentialsEncrypted: true,
              enabled: true,
              provider: true,
              status: true,
            },
          },
          publicId: true,
        },
      },
      role: true,
    },
    where: { userId },
  });
  // Fail closed on an unserializable project ID before any further read.
  const projectIds = memberships.map((m) => requireApiPublicId(m.project.publicId ?? "", "prj"));
  // The flag belongs to the project's owner account, whose keys and spend a project uses.
  const owners = [...new Set([userId, ...memberships.map((m) => m.project.ownerId)])];
  const required = new Map(
    await Promise.all(
      owners.map(async (ownerId) => [ownerId, await ownProviderKeysRequired(ownerId)] as const),
    ),
  );

  return {
    email: user.email,
    id: requireApiPublicId(user.publicId ?? "", "usr"),
    name: user.name,
    projects: memberships.map((membership, index) => {
      const keysRequired = required.get(membership.project.ownerId) === true;
      return {
        domain: membership.project.domain,
        id: projectIds[index],
        missing_provider_keys: keysRequired
          ? missingOwnKeys(membership.project.providerConnections)
          : [],
        name: membership.project.name,
        provider_keys_required: keysRequired,
        role: membership.role,
      };
    }),
    provider_keys_required: required.get(userId) === true,
  };
}

export async function getMe(ctx: PersonalApiContext) {
  return resourceResponse(await meResource(ctx.auth.user.id, ctx.auth.user), {
    headers: ctx.headers,
  });
}

export async function updateMe(ctx: PersonalApiContext) {
  const body = await readJsonBody(ctx);
  const data = parseApiInput(mePatchSchema, objectBody(body));
  const updated = await updateProfileNameRecord(ctx.auth.user.id, data.name);

  return resourceResponse(
    await meResource(ctx.auth.user.id, {
      email: ctx.auth.user.email,
      name: updated.name,
      publicId: ctx.auth.user.publicId,
    }),
    { headers: ctx.headers },
  );
}

/**
 * Deletes the caller's account (App Review 5.1.1(v)). Requires an admin-scope
 * personal token or a recently authenticated app token with api:write, plus email confirmation.
 */
export async function deleteMe(ctx: PersonalApiContext) {
  const body = await readJsonBody(ctx);
  const data = parseApiInput(meDeleteSchema, objectBody(body));
  try {
    await deleteAccountRecords({
      confirmEmail: data.confirmEmail,
      source: "api",
      userId: ctx.auth.user.id,
    });
  } catch (error) {
    if (error instanceof AccountDeletionConfirmationError) {
      return errorResponse("validation_failed", error.message, 422, {
        headers: ctx.headers,
        instance: ctx.instance,
        problemDetails: { code: error.code },
      });
    }
    if (error instanceof LastInstanceAdminDeletionError) {
      return errorResponse("conflict", error.message, 409, {
        headers: ctx.headers,
        instance: ctx.instance,
        problemDetails: { code: error.code },
      });
    }
    throw error;
  }
  return resourceResponse({ deleted: true }, { headers: ctx.headers });
}
