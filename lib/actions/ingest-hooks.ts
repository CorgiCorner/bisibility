"use server";

import { randomBytes } from "node:crypto";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ingestDeployEvent } from "@/lib/ingest/ingest-deploy-event";
import { hashApiKey } from "@/lib/providers/crypto";
import { appPath } from "@/lib/routing/app-path";
import { createIngestHookSchema, mutateIngestHookSchema } from "@/lib/schemas/ingestHook";
import {
  getActionActor,
  makePublicId,
  parseActionInput,
  requireProjectScope,
  revalidateSettingsViews,
  revalidateTimelineViews,
} from "./_shared";

function newRawIngestToken() {
  return `bih_live_${randomBytes(24).toString("base64url")}`;
}

function maskIssuedToken(raw: string) {
  return `${raw.slice(0, 17)}******${raw.slice(-4)}`;
}

function safeHook(hook: { disabled?: boolean; label: string; publicId: string }) {
  return {
    disabled: hook.disabled ?? false,
    id: hook.publicId,
    label: hook.label,
  };
}

type IngestHookClient = Pick<Prisma.TransactionClient, "ingestHook">;

async function findHook(projectId: string, hookId: string, client: IngestHookClient = prisma) {
  if (parsePublicId(hookId)?.prefix !== "dwh") {
    return null;
  }

  return client.ingestHook.findFirst({
    select: { disabled: true, id: true, label: true, publicId: true },
    where: { projectId, publicId: hookId },
  });
}

export async function createIngestHook(input: unknown) {
  const data = parseActionInput(createIngestHookSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "ingest_hook",
  });
  const raw = newRawIngestToken();
  const hook = await prisma.ingestHook.create({
    data: {
      createdById: actor.id,
      label: data.label,
      projectId: project.id,
      publicId: makePublicId("dwh"),
      tokenHash: hashApiKey(raw),
    },
    select: { createdAt: true, disabled: true, id: true, label: true, publicId: true },
  });

  await writeAudit({
    action: "ingest_hook.create",
    actorId: actor.id,
    after: safeHook(hook),
    projectId: project.id,
    targetId: hook.publicId,
    targetType: "ingest_hook",
  });
  revalidateSettingsViews();

  return {
    id: hook.publicId,
    label: hook.label,
    maskedValue: maskIssuedToken(raw),
    raw,
  };
}

export async function disableIngestHook(input: unknown) {
  const data = parseActionInput(mutateIngestHookSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "ingest_hook",
  });
  const before = await findHook(project.id, data.hookId);
  if (!before) {
    throw new Error("Deploy webhook not found.");
  }
  if (before.disabled) {
    throw new Error("Deploy webhook is already disabled.");
  }

  const hook = await prisma.ingestHook.update({
    data: { disabled: true },
    select: { disabled: true, id: true, label: true, publicId: true },
    where: { id: before.id },
  });

  await writeAudit({
    action: "ingest_hook.disable",
    actorId: actor.id,
    after: safeHook(hook),
    before: safeHook(before),
    projectId: project.id,
    targetId: hook.publicId,
    targetType: "ingest_hook",
  });
  revalidateSettingsViews();

  return safeHook(hook);
}

export async function rotateIngestHook(input: unknown) {
  const data = parseActionInput(mutateIngestHookSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "ingest_hook",
  });
  const raw = newRawIngestToken();
  const hook = await prisma.$transaction(async (tx) => {
    const before = await findHook(project.id, data.hookId, tx);
    if (!before) {
      throw new Error("Deploy webhook not found.");
    }
    if (before.disabled) {
      throw new Error("Disabled deploy webhooks cannot be rotated.");
    }

    const updated = await tx.ingestHook.update({
      data: { tokenHash: hashApiKey(raw) },
      select: { disabled: true, id: true, label: true, publicId: true },
      where: { id: before.id },
    });
    await writeAudit(
      {
        action: "ingest_hook.rotate",
        actorId: actor.id,
        after: safeHook(updated),
        before: safeHook(before),
        projectId: project.id,
        targetId: updated.publicId,
        targetType: "ingest_hook",
      },
      tx,
    );
    return updated;
  });
  revalidateSettingsViews();

  return {
    id: hook.publicId,
    label: hook.label,
    maskedValue: maskIssuedToken(raw),
    raw,
  };
}

export async function sendIngestHookTest(input: unknown) {
  const data = parseActionInput(mutateIngestHookSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "ingest_hook",
  });
  const hook = await findHook(project.id, data.hookId);
  if (!hook) {
    throw new Error("Deploy webhook not found.");
  }
  if (hook.disabled) {
    throw new Error("Disabled deploy webhooks cannot send test events.");
  }

  const result = await ingestDeployEvent({
    actorId: actor.id,
    body: {
      deployment_id: `test_${randomBytes(12).toString("base64url")}`,
      environment: "test",
      paths: ["/"],
    },
    hookId: hook.id,
    projectId: project.id,
    provider: null,
    test: true,
  });
  if (result.status !== "created") {
    throw new Error("Deploy webhook test event could not be created.");
  }

  revalidateTimelineViews();
  const signalId = result.signal.publicId;
  return {
    signalHref: `${appPath(project.publicId, "timeline")}?filter=deploys&q=${encodeURIComponent(signalId)}#signal-${signalId}`,
    signalId,
  };
}

export async function deleteIngestHook(input: unknown) {
  const data = parseActionInput(mutateIngestHookSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, {
    type: "ingest_hook",
  });
  const before = await findHook(project.id, data.hookId);
  if (!before) {
    throw new Error("Deploy webhook not found.");
  }

  await prisma.ingestHook.delete({ where: { id: before.id } });
  await writeAudit({
    action: "ingest_hook.delete",
    actorId: actor.id,
    before: safeHook(before),
    projectId: project.id,
    targetId: before.publicId,
    targetType: "ingest_hook",
  });
  revalidateSettingsViews();

  return { deleted: true, id: before.publicId };
}
