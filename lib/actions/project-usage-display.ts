"use server";
import { getActionActor, revalidateBudgetViews } from "@/lib/actions/_shared";
import { AuthorizationError } from "@/lib/auth/authorize";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { UsageDisplayUnavailableError } from "@/lib/project-usage-display/access";
import type { UsageDisplaySaveResult } from "@/lib/project-usage-display/schema";
import {
  saveProjectUsageDisplaySettings,
  UsageDisplayConflictError,
} from "@/lib/project-usage-display/store";
import { ZodError } from "zod";

export async function updateProjectUsageDisplay(input: unknown): Promise<UsageDisplaySaveResult> {
  try {
    const value = await saveProjectUsageDisplaySettings(input, await getActionActor());
    revalidateBudgetViews();
    return { kind: "saved", value };
  } catch (error) {
    if (error instanceof UsageDisplayConflictError)
      return { kind: "conflict", value: error.current };
    if (
      error instanceof AuthorizationError ||
      error instanceof ProjectReadOnlyError ||
      error instanceof UsageDisplayUnavailableError
    )
      return { kind: "forbidden" };
    if (error instanceof ZodError) return { kind: "invalid" };
    throw error;
  }
}
