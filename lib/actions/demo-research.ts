"use server";

import { findStoredBacklinks, listStoredBacklinks } from "@/lib/backlinks/stored";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { isEditableDemoResearchProject } from "@/lib/demo/research-storage";
import { findStoredDomainOverview, listStoredDomainOverviews } from "@/lib/domain-overview/stored";
import {
  findStoredKeywordResearch,
  listStoredKeywordResearch,
} from "@/lib/keyword-research/stored-read";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

const projectId = z
  .string()
  .trim()
  .refine((value) => isPublicIdOfType(value, "prj"));
const listSchema = z.object({ projectId }).strict();
const keywordReadSchema = z
  .object({ projectId, requestKey: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
const backlinksReadSchema = z
  .object({
    includeSubdomains: z.boolean(),
    mode: z.enum(["as_is", "one_per_domain"]),
    projectId,
    target: z.string().trim().min(1).max(2_048),
    targetScope: z.enum(["page", "site"]).optional(),
  })
  .strict();
const domainReadSchema = z
  .object({
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .optional(),
    languageCode: z.string().trim().min(2).max(12),
    locationCode: z.number().int().positive(),
    projectId,
    scope: z.enum(["root", "subdomain"]),
    target: z.string().trim().min(1).max(253),
  })
  .strict();

async function readableDemoProject(projectId: string) {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", projectId, { type: "project" });
  return isEditableDemoResearchProject(project.publicId) ? project : null;
}

export async function listDemoKeywordResearchAction(input: unknown) {
  const data = parseActionInput(listSchema, input);
  const project = await readableDemoProject(data.projectId);
  return project ? listStoredKeywordResearch({ projectId: project.id }) : [];
}

export async function readDemoKeywordResearchAction(input: unknown) {
  const data = parseActionInput(keywordReadSchema, input);
  const project = await readableDemoProject(data.projectId);
  return project
    ? findStoredKeywordResearch({ projectId: project.id, requestKey: data.requestKey })
    : null;
}

export async function listDemoBacklinksAction(input: unknown) {
  const data = parseActionInput(listSchema, input);
  const project = await readableDemoProject(data.projectId);
  return project ? listStoredBacklinks({ projectId: project.id }) : [];
}

export async function readDemoBacklinksAction(input: unknown) {
  const data = parseActionInput(backlinksReadSchema, input);
  const project = await readableDemoProject(data.projectId);
  return project ? findStoredBacklinks({ ...data, projectId: project.id }) : null;
}

export async function listDemoDomainOverviewsAction(input: unknown) {
  const data = parseActionInput(listSchema, input);
  const project = await readableDemoProject(data.projectId);
  return project ? listStoredDomainOverviews({ projectId: project.id }) : [];
}

export async function readDemoDomainOverviewAction(input: unknown) {
  const data = parseActionInput(domainReadSchema, input);
  const project = await readableDemoProject(data.projectId);
  return project ? findStoredDomainOverview({ ...data, projectId: project.id }) : null;
}
