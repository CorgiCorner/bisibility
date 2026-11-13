import "server-only";

import { prisma } from "@/lib/db/prisma";
import { readDemoConfig } from "@/lib/demo/config";
import { cache } from "react";

export const PROJECT_SEO_CHALLENGE_SETTING = "projectSeoChallenge.enabled";

export const projectSeoChallengeEnabled = cache(async () => {
  if (readDemoConfig().kind !== "disabled") return false;
  const setting = await prisma.instanceSetting.findUnique({
    select: { value: true },
    where: { key: PROJECT_SEO_CHALLENGE_SETTING },
  });
  return setting?.value === "true";
});
