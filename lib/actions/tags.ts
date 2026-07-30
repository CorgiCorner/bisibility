"use server";

import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import {
  getActionActor,
  makePublicId,
  parseActionInput,
  requireProjectScope,
  revalidateKeywordViews,
} from "./_shared";
import { handledActionResult } from "./action-result";

const idSchema = z.string().trim().min(1).max(120);
const tagNameSchema = z.string().trim().min(1).max(48);
const createTagSchema = z.object({ name: tagNameSchema, projectId: idSchema });
const deleteTagSchema = z.object({ name: tagNameSchema, projectId: idSchema });
const renameTagSchema = z
  .object({ fromName: tagNameSchema, projectId: idSchema, toName: tagNameSchema })
  .refine((data) => data.fromName !== data.toName, {
    message: "Choose a different tag name.",
    path: ["toName"],
  });

function revalidateKeywords() {
  revalidateKeywordViews();
}

async function scopedProject(projectId: string, action: "create" | "delete" | "update" = "update") {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, action, projectId, { type: "keyword" });
  return { actor, project };
}

export async function createTag(input: unknown) {
  const data = parseActionInput(createTagSchema, input);
  const { actor, project } = await scopedProject(data.projectId, "create");
  const existing = await prisma.tag.findFirst({
    select: { id: true },
    where: { name: data.name, projectId: project.id },
  });
  if (existing) {
    throw new Error("Tag already exists.");
  }

  const tag = await prisma.tag.create({
    data: { name: data.name, projectId: project.id, publicId: makePublicId("tag") },
    select: { id: true, name: true, publicId: true },
  });
  await writeAudit({
    action: "tag.create",
    actorId: actor.id,
    after: { name: tag.name },
    projectId: project.id,
    targetId: requiredPublicAuditId(tag.publicId, "tag", "Tag"),
    targetType: "tag",
  });
  revalidateKeywords();
  return { created: true };
}

export async function createTagResult(input: unknown) {
  return handledActionResult(() => createTag(input));
}

export async function renameTag(input: unknown) {
  const data = parseActionInput(renameTagSchema, input);
  const { actor, project } = await scopedProject(data.projectId);
  const result = await prisma.$transaction(async (tx) => {
    const source = await tx.tag.findFirst({
      select: { id: true, keywords: { select: { keywordId: true } }, name: true, publicId: true },
      where: { name: data.fromName, projectId: project.id },
    });
    if (!source) throw new Error("Tag not found.");

    const target = await tx.tag.findFirst({
      select: { id: true, name: true, publicId: true },
      where: { name: data.toName, projectId: project.id },
    });
    if (target) {
      await tx.keywordTag.createMany({
        data: source.keywords.map((row) => ({ keywordId: row.keywordId, tagId: target.id })),
        skipDuplicates: true,
      });
      await tx.tag.delete({ where: { id: source.id } });
      return {
        count: source.keywords.length,
        fromName: source.name,
        publicId: target.publicId,
        merged: true,
      };
    }

    const updated = await tx.tag.update({
      data: { name: data.toName },
      select: { id: true, publicId: true },
      where: { id: source.id },
    });
    return {
      count: source.keywords.length,
      fromName: source.name,
      publicId: updated.publicId,
      merged: false,
    };
  });

  await writeAudit({
    action: "tag.rename",
    actorId: actor.id,
    after: { count: result.count, merged: result.merged, name: data.toName },
    before: { name: result.fromName },
    projectId: project.id,
    targetId: requiredPublicAuditId(result.publicId, "tag", "Tag"),
    targetType: "tag",
  });
  revalidateKeywords();
  return { merged: result.merged, renamed: result.count };
}

export async function renameTagResult(input: unknown) {
  return handledActionResult(() => renameTag(input));
}

export async function deleteTag(input: unknown) {
  const data = parseActionInput(deleteTagSchema, input);
  const { actor, project } = await scopedProject(data.projectId, "delete");
  const result = await prisma.$transaction(async (tx) => {
    const tag = await tx.tag.findFirst({
      select: { id: true, keywords: { select: { keywordId: true } }, name: true, publicId: true },
      where: { name: data.name, projectId: project.id },
    });
    if (!tag) throw new Error("Tag not found.");
    await tx.tag.delete({ where: { id: tag.id } });
    return { count: tag.keywords.length, name: tag.name, publicId: tag.publicId };
  });

  await writeAudit({
    action: "tag.delete",
    actorId: actor.id,
    before: { count: result.count, name: result.name },
    projectId: project.id,
    targetId: requiredPublicAuditId(result.publicId, "tag", "Tag"),
    targetType: "tag",
  });
  revalidateKeywords();
  return { deleted: result.count };
}

export async function deleteTagResult(input: unknown) {
  return handledActionResult(() => deleteTag(input));
}
