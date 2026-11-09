"use server";
import { getActionActor, requireProjectScope } from "@/lib/actions/_shared";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { verificationInputSchema } from "@/lib/domain-verification/model";
import {
  checkDomainVerification,
  issueDomainVerification,
  verificationResource,
} from "@/lib/domain-verification/service";
import { z } from "zod";

const issueInput = verificationInputSchema.extend({ projectId: z.string().min(1) });
const checkInput = z.object({ projectId: z.string().min(1) }).strict();
async function scope(projectId: string) {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", projectId, { type: "project" });
  return { actor, project };
}
export async function startProjectDomainVerification(input: unknown) {
  const { projectId, method } = issueInput.parse(input);
  const { actor, project } = await scope(projectId);
  const result = await issueDomainVerification(project.id, actor, { method });
  recordAppAction(actor);
  return verificationResource(result);
}
export async function checkProjectDomainVerification(input: unknown) {
  const { projectId } = checkInput.parse(input);
  const { actor, project } = await scope(projectId);
  const result = await checkDomainVerification(project.id, actor);
  recordAppAction(actor);
  return verificationResource(result);
}
