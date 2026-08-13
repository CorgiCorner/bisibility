import { type Action, type Actor, authorize, type Resource } from "@/lib/auth/authorize";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";

export { makePublicId } from "@/lib/db/public-id";

import { assertProjectWritable, type ProjectWriteMode } from "@/lib/deployment/project-write-mode";
import { appPath, appRootPath, asProjectRef } from "@/lib/routing/app-path";
import { revalidatePath } from "next/cache";
import type { z } from "zod";

export type ProjectScope = {
  domain: string;
  id: string;
  isSample: boolean;
  ownerId: string;
  publicId: string;
  writeMode?: ProjectWriteMode;
  writeModeChangedAt?: Date | null;
  writeModeChangedById?: string | null;
};

export type KeywordScope = {
  id: string;
  projectId: string;
  projectIsSample: boolean;
  projectPublicId: string;
  publicId: string;
  text: string;
};

export function parseActionInput<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown,
): z.infer<TSchema> {
  if (input instanceof FormData) {
    const values: Record<string, unknown> = {};
    for (const [key, value] of input.entries()) {
      const previous = values[key];
      if (previous === undefined) {
        values[key] = value;
      } else if (Array.isArray(previous)) {
        previous.push(value);
      } else {
        values[key] = [previous, value];
      }
    }
    return schema.parse(values);
  }

  return schema.parse(input);
}

export async function getActionActor(): Promise<Actor> {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    select: {
      id: true,
      memberships: { select: { projectId: true, role: true } },
      role: true,
    },
    where: { id: session.user.id },
  });

  return {
    id: session.user.id,
    memberships: user?.memberships ?? [],
    role: user?.role ?? null,
  };
}

export async function findProjectScope(projectId: string) {
  if (parsePublicId(projectId)?.prefix !== "prj") {
    return null;
  }

  return prisma.project.findFirst({
    select: {
      domain: true,
      id: true,
      isSample: true,
      ownerId: true,
      publicId: true,
      writeMode: true,
      writeModeChangedAt: true,
      writeModeChangedById: true,
    },
    where: { publicId: projectId },
  });
}

type ScopeOptions = {
  allowReadOnly?: boolean;
};

export async function requireProjectScope(
  actor: Actor,
  action: Action,
  projectId: string,
  resource: Omit<Resource, "projectId">,
  options: ScopeOptions = {},
) {
  const project = await findProjectScope(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }

  authorize(actor, action, { ...resource, projectId: project.id });
  if (!options.allowReadOnly && action !== "read") {
    assertProjectWritable(project);
  }
  return project;
}

export async function requireKeywordScope(
  actor: Actor,
  action: Action,
  keywordId: string,
  options: ScopeOptions = {},
) {
  if (parsePublicId(keywordId)?.prefix !== "kw") {
    throw new Error("Keyword not found.");
  }

  const keyword = await prisma.keyword.findFirst({
    select: {
      id: true,
      project: { select: { id: true, isSample: true, publicId: true, writeMode: true } },
      projectId: true,
      publicId: true,
      text: true,
    },
    where: { publicId: keywordId },
  });
  if (!keyword) {
    throw new Error("Keyword not found.");
  }

  authorize(actor, action, { projectId: keyword.projectId, type: "keyword" });
  if (!options.allowReadOnly && action !== "read") {
    assertProjectWritable(keyword.project);
  }
  return {
    id: keyword.id,
    projectId: keyword.projectId,
    projectIsSample: keyword.project.isSample,
    projectPublicId: keyword.project.publicId,
    publicId: keyword.publicId,
    text: keyword.text,
  };
}

type RevalidateTarget = { path: string; type?: "layout" | "page" };

const PROJECT_ROUTE = asProjectRef("[project]");

function projectPage(...segments: string[]): RevalidateTarget {
  return { path: appPath(PROJECT_ROUTE, ...segments), type: "page" };
}

function revalidateTargets(targets: RevalidateTarget[]) {
  for (const target of targets) {
    if (target.type) {
      revalidatePath(target.path, target.type);
    } else {
      revalidatePath(target.path);
    }
  }
}

function keywordDetailTarget(_keywordId?: string | null): RevalidateTarget {
  return projectPage("rank-tracker", "[id]");
}

export function revalidateKeywordViews(keywordId?: string | null) {
  revalidateTargets([
    projectPage("rank-tracker"),
    keywordDetailTarget(keywordId),
    projectPage("overview"),
    projectPage("timeline"),
    projectPage("alerts"),
    projectPage("competitors"),
    projectPage("settings", "audit"),
  ]);
}

export function revalidateRankCheckViews(keywordId?: string | null) {
  revalidateTargets([
    projectPage("overview"),
    projectPage("rank-tracker"),
    keywordDetailTarget(keywordId),
    projectPage("timeline"),
    projectPage("alerts"),
    projectPage("competitors"),
    projectPage("settings", "audit"),
    projectPage("integrations"),
  ]);
}

export function revalidateProviderViews() {
  revalidateTargets([
    projectPage("rank-tracker"),
    projectPage("integrations"),
    projectPage("overview"),
    projectPage("settings"),
    projectPage("settings", "audit"),
  ]);
}

export function revalidateAlertViews() {
  revalidateTargets([projectPage("alerts"), projectPage("settings", "audit")]);
}

export function revalidateCompetitorViews() {
  revalidateTargets([
    projectPage("competitors"),
    projectPage("overview"),
    projectPage("settings", "audit"),
  ]);
}

export function revalidateTimelineViews() {
  revalidateTargets([projectPage("timeline"), projectPage("settings", "audit")]);
}

export function revalidateBudgetViews() {
  // The workspace layout renders the header spend meter, so revalidate it as a layout.
  revalidateTargets([
    { path: appRootPath(), type: "layout" },
    projectPage("overview"),
    projectPage("settings"),
    projectPage("settings", "audit"),
  ]);
}

export function revalidateSettingsViews() {
  revalidateTargets([
    projectPage("settings"),
    projectPage("rank-tracker"),
    projectPage("settings", "audit"),
  ]);
}

export function revalidateSettingsPage() {
  revalidateTargets([projectPage("settings")]);
}
