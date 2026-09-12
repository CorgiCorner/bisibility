import "server-only";

import { APIError } from "better-auth/api";
import { readDemoConfig } from "./config";
import { loadConfiguredDemoActor } from "./identity";

const EDITABLE_VIEWER_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

type SessionCreation = { expiresAt: Date; userId: string };

export async function prepareDemoSessionCreation<T extends SessionCreation>(session: T) {
  const config = readDemoConfig();
  if (config.kind === "disabled") return session;
  const actor = await loadConfiguredDemoActor(session.userId);
  if (!actor) throw new APIError("FORBIDDEN", { message: "Demo identity is unavailable." });
  if (config.kind === "editable" && actor.kind === "viewer") {
    return { ...session, expiresAt: new Date(Date.now() + EDITABLE_VIEWER_SESSION_TTL_MS) };
  }
  return session;
}
