"use server";
import { prisma } from "@/lib/db/prisma";
import {
  DefinitionConflictError,
  DefinitionUnavailableError,
} from "@/lib/measurement-definitions/errors";
import {
  configureHostDefinitionPolicy,
  configureHostPolicySchema,
} from "@/lib/measurement-definitions/host-policy-configuration";
import type { ConfigureHostPolicyResult } from "@/lib/measurement-definitions/host-policy-contract";
import { appPath } from "@/lib/routing/app-path";
import { revalidatePath } from "next/cache";
import { getActionActor, revalidateRankCheckViews } from "./_shared";

/** Only an explicit settings mutation. Fresh membership/writeMode and CAS are checked again in its transaction. */
export async function configureMeasurementDefinitionPolicyAction(
  input: unknown,
): Promise<ConfigureHostPolicyResult> {
  const data = configureHostPolicySchema.parse(input);
  const actor = await getActionActor();
  try {
    const result = await configureHostDefinitionPolicy(prisma, { actor }, data);
    revalidateRankCheckViews();
    revalidatePath(appPath(data.projectId, "settings", "tracking"));
    return { kind: "saved", ...result, repreviewRequired: true };
  } catch (error) {
    if (error instanceof DefinitionConflictError) return { kind: "conflict" };
    if (error instanceof DefinitionUnavailableError) return { kind: "unavailable" };
    throw error;
  }
}
