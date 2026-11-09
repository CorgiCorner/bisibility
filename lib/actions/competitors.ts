"use server";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { withCapacityFailure } from "@/lib/capacity/action";
import {
  addManagedCompetitorFor,
  removeManagedCompetitorFor,
  renameManagedCompetitorFor,
} from "@/lib/competitors/service";
import {
  addManagedCompetitorSchema,
  removeManagedCompetitorSchema,
  renameManagedCompetitorSchema,
} from "@/lib/competitors/types";
import { getActionActor, parseActionInput } from "./_shared";

export async function addManagedCompetitor(input: unknown) {
  return withCapacityFailure(async () => {
    const data = parseActionInput(addManagedCompetitorSchema, input);
    const actor = await getActionActor();
    const actionResult = await addManagedCompetitorFor(
      data,
      { actor, auditActorId: actor.id },
      () => recordAppAction(actor),
    );
    return actionResult;
  });
}

export async function renameManagedCompetitor(input: unknown) {
  const data = parseActionInput(renameManagedCompetitorSchema, input);
  const actor = await getActionActor();
  const actionResult = await renameManagedCompetitorFor(
    data,
    { actor, auditActorId: actor.id },
    () => recordAppAction(actor),
  );
  return actionResult;
}

export async function removeManagedCompetitor(input: unknown) {
  const data = parseActionInput(removeManagedCompetitorSchema, input);
  const actor = await getActionActor();
  const actionResult = await removeManagedCompetitorFor(
    data,
    { actor, auditActorId: actor.id },
    () => recordAppAction(actor),
  );
  return actionResult;
}
