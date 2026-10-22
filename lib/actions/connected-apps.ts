"use server";

import { revokeUserConnectedApp } from "@/lib/api/connected-apps";
import { requireSession } from "@/lib/auth/session";
import {
  type RevokeConnectedAppOptions,
  revokeConnectedAppSchema,
} from "@/lib/schemas/connected-app";
import { revalidatePath } from "next/cache";

export async function revokeConnectedApp(clientId: string, options: RevokeConnectedAppOptions) {
  const session = await requireSession();
  const input = revokeConnectedAppSchema.parse({ ...options, clientId });
  const result = await revokeUserConnectedApp(session.user.id, input.clientId, input);
  revalidatePath("/app/account/security");
  return result;
}
