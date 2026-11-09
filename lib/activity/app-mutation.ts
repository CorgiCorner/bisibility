import "server-only";

import { RETURN_TO_REQUEST_HEADER } from "@/lib/auth/return-to";
import { headers } from "next/headers";
import { recordUserActivity } from "./record-extension";
import { ACTIVITY_METHOD_HEADER, sessionActivityKind } from "./request";

type ActionActor = { id: string; email?: string };

/** Call only after an authorized write commits, with its already authenticated actor. */
export function recordAppAction(actor: ActionActor | { user: ActionActor } | null): void {
  if (!actor) return;
  const user = "user" in actor ? actor.user : actor;
  // Header lookup and recording must never delay or reject the mutation response.
  void (async () => {
    const request = await headers();
    if (
      sessionActivityKind(
        request.get(RETURN_TO_REQUEST_HEADER),
        request.get(ACTIVITY_METHOD_HEADER),
        request.get("next-action"),
      ) !== "acted"
    )
      return;
    await recordUserActivity({
      userId: user.id,
      email: user.email ?? "",
      channel: "app",
      kind: "acted",
      interactive: true,
    });
  })().catch(() => console.error("[user-activity] Could not record App mutation."));
}
