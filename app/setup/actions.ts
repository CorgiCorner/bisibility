"use server";

import { auth } from "@/lib/auth/auth";
import { isFirstRun } from "@/lib/auth/first-run";
import { promoteFirstRunAdministrator } from "@/lib/auth/first-run-account";
import { type SetupFormValues, setupAccountSchema } from "@/lib/auth/first-run-schema";
import { getAuditRequestContext } from "@/lib/auth/request-context";
import { requireSession } from "@/lib/auth/session";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type SetupActionResult =
  | { message: string; status: "error"; field?: "email" | "name" | "otp" }
  | { status: "complete" | "ready" };

function firstIssue(
  issues: readonly { message: string; path: PropertyKey[] }[],
): SetupActionResult {
  const issue = issues[0];
  const field = issue?.path[0];
  return {
    field: field === "email" || field === "name" || field === "otp" ? field : undefined,
    message: issue?.message ?? "Check the form and try again.",
    status: "error",
  };
}

function completedError(): SetupActionResult {
  return {
    message: "Administrator setup is already complete. Sign in to continue.",
    status: "error",
  };
}

async function signOutCurrentSession() {
  await auth.api.signOut({ headers: await headers() });
}

export async function requestSetupCodeAction(values: SetupFormValues): Promise<SetupActionResult> {
  if (!(await isFirstRun())) {
    return completedError();
  }

  const parsed = setupAccountSchema.safeParse(values);
  if (!parsed.success) {
    return firstIssue(parsed.error.issues);
  }

  try {
    await auth.api.sendVerificationOTP({
      body: { email: parsed.data.email, type: "sign-in" },
    });
  } catch {
    return {
      field: "email",
      message: "We could not send a code. Check your server email configuration and try again.",
      status: "error",
    };
  }

  return { status: "ready" };
}

export async function completeSetupAction(): Promise<SetupActionResult> {
  const session = await requireSession();
  let result: Awaited<ReturnType<typeof promoteFirstRunAdministrator>>;
  try {
    result = await promoteFirstRunAdministrator(
      session.user.id,
      session.user.email,
      await getAuditRequestContext(),
    );
  } catch {
    return {
      field: "otp",
      message: "We could not finish setup. Try again.",
      status: "error",
    };
  }

  if (result === "administrator_exists") {
    await signOutCurrentSession();
    return completedError();
  }

  if (result === "retry") {
    return {
      field: "otp",
      message: "We could not finish setup. Try again.",
      status: "error",
    };
  }

  return { status: "complete" };
}

export async function signOutAndSwitchAccountAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
