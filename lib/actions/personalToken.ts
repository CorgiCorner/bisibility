"use server";

import { issuePersonalToken, revokePersonalToken } from "@/lib/api/pat-service";
import { requireSession } from "@/lib/auth/session";
import { parsePublicId } from "@/lib/db/public-id";
import { issuePersonalTokenSchema, revokePersonalTokenSchema } from "@/lib/schemas/personalToken";
import { parseActionInput, revalidateSettingsPage } from "./_shared";

export async function issuePersonalTokenAction(input: unknown) {
  const data = parseActionInput(issuePersonalTokenSchema, input);
  const session = await requireSession();
  const issued = await issuePersonalToken(session.user.id, {
    expiresInDays: data.expiresInDays,
    name: data.name,
    scope: data.scope,
  });
  revalidateSettingsPage();

  return {
    maskedValue: issued.maskedValue,
    name: issued.name,
    raw: issued.raw,
  };
}

export async function revokePersonalTokenAction(input: unknown) {
  const data = parseActionInput(revokePersonalTokenSchema, input);
  const session = await requireSession();
  if (parsePublicId(data.tokenId)?.prefix !== "pat") {
    throw new Error("Personal access token not found.");
  }
  const revoked = await revokePersonalToken(session.user.id, data.tokenId);
  if (!revoked) {
    throw new Error("Personal access token not found.");
  }
  revalidateSettingsPage();

  return { id: data.tokenId, revokedAt: revoked.revokedAt };
}
