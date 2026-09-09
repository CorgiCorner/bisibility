"use server";

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
  const data = parseActionInput(addManagedCompetitorSchema, input);
  const actor = await getActionActor();
  return addManagedCompetitorFor(data, { actor, auditActorId: actor.id });
}

export async function renameManagedCompetitor(input: unknown) {
  const data = parseActionInput(renameManagedCompetitorSchema, input);
  const actor = await getActionActor();
  return renameManagedCompetitorFor(data, { actor, auditActorId: actor.id });
}

export async function removeManagedCompetitor(input: unknown) {
  const data = parseActionInput(removeManagedCompetitorSchema, input);
  const actor = await getActionActor();
  return removeManagedCompetitorFor(data, { actor, auditActorId: actor.id });
}
