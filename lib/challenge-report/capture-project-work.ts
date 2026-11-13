import "server-only";

import { after } from "next/server";
import { recordProjectChallengeWork } from "./project-challenge";

/** Schedule only after successful, interactive work on a known project. */
export function captureProjectWork(userId: string, projectId: string) {
  const at = new Date();
  try {
    after(async () => {
      try {
        await recordProjectChallengeWork(userId, projectId, at);
      } catch {
        console.error("[project-challenge] Could not record project work.");
      }
    });
  } catch {
    console.error("[project-challenge] Could not schedule project work capture.");
  }
}
