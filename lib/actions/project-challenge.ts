"use server";

import { validTimeZone } from "@/lib/achievements/calendar";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { projectSeoChallengeEnabled } from "@/lib/challenge-report/feature";
import { isDateKey } from "@/lib/challenge-report/period";
import { startProjectChallenge } from "@/lib/challenge-report/project-challenge";
import {
  markProjectChallengeDay,
  recordProjectChallengeVisit,
} from "@/lib/challenge-report/project-challenge-check-in";
import { appPath } from "@/lib/routing/app-path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActionActor, requireProjectScope } from "./_shared";

const projectRef = z.string().trim().min(1).max(120);
const dayKey = z.string().refine(isDateKey);
const startTimeZone = z.string().max(128).refine(validTimeZone).optional();

/** The explicit Start. It captures the challenge's own Day 1 baseline and checks in Day 1. */
export async function startProjectChallengeAction(projectId: string, timeZone?: string) {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", projectRef.parse(projectId), {
    type: "project",
  });
  if (!(await projectSeoChallengeEnabled())) return null;
  const challenge = await startProjectChallenge({
    projectId: project.id,
    timeZone: startTimeZone.parse(timeZone),
    userId: actor.id,
  });
  if (challenge) {
    recordAppAction(actor);
    revalidatePath(appPath(project.publicId, "pages"));
  }
  return challenge;
}

/** A participant marks a window day they worked on, today or earlier. */
export async function markProjectChallengeDayAction(projectId: string, day: string) {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", projectRef.parse(projectId), {
    type: "project",
  });
  const result = await markProjectChallengeDay(actor.id, project.id, dayKey.parse(day));
  if (result === "recorded") revalidatePath(appPath(project.publicId, "pages"));
  return { ok: result === "recorded" || result === "existing" };
}

/** Called once per visible local day by the project shell. Never throws to the shell. */
export async function touchProjectChallengeVisitAction(projectId: string) {
  try {
    const actor = await getActionActor();
    const project = await requireProjectScope(actor, "read", projectRef.parse(projectId), {
      type: "project",
    });
    const result = await recordProjectChallengeVisit(actor.id, project.id);
    return { recorded: result === "recorded" };
  } catch {
    return { recorded: false };
  }
}
